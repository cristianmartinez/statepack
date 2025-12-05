import { batch as signalBatch } from "@preact/signals-core";
import { compileMachine, type CompiledCache, type CompiledMachine } from "../compiler";
import { isCompiledMachine } from "../compiler/types";
import {
  type ActionContext,
  type ActionEffect,
  executeActions,
  normalizeActions,
} from "../interpreter/actions";
import { createGuardContext, findMatchingTransition } from "../interpreter/guards";
import {
  createInitialState,
  type Event,
  getActiveStateNodes,
  matchesState,
  type State,
  type StateValue,
  toStateString,
} from "../interpreter/state";
import type { Action, GuardDefinition, Machine, StateNode, Transition } from "../schema/types";
import { createSignalStore } from "./store";
import type { MachineEvent, SignalStore } from "./types";

/**
 * Options for the signal-aware interpreter
 */
export interface SignalInterpreterOptions {
  /** Execute side effects */
  execute?: (effect: ActionEffect) => Promise<void>;
  /** Called on state transitions */
  onTransition?: (state: State) => void;
  /** Called when done */
  onDone?: (state: State) => void;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Signal-aware state machine interpreter.
 *
 * Uses @preact/signals-core for fine-grained reactivity:
 * - Each context field is an independent signal
 * - State updates are batched during action sequences
 * - Subscribers only re-render when their specific signals change
 *
 * @example
 * ```typescript
 * const interpreter = new SignalInterpreter(machine);
 * await interpreter.start();
 *
 * // Subscribe to specific context field
 * effect(() => {
 *   console.log("Count:", interpreter.store.context.count.value);
 * });
 *
 * // Send event
 * await interpreter.send("INCREMENT");
 * ```
 */
export class SignalInterpreter<TContext extends Record<string, unknown> = Record<string, unknown>> {
  private machine: Machine;
  private options: SignalInterpreterOptions;
  private namedGuards: Record<string, GuardDefinition>;
  private namedActions: Record<string, Action | Action[]>;
  private timers: Map<string, ReturnType<typeof setTimeout>>;
  private running: boolean;
  private compiled?: CompiledCache;

  /** The reactive signal store for fine-grained subscriptions */
  readonly store: SignalStore<TContext>;

  constructor(machine: Machine | CompiledMachine, options: SignalInterpreterOptions = {}) {
    // Extract source machine and compiled cache
    if (isCompiledMachine(machine)) {
      this.machine = machine.source;
      this.compiled = machine.compiled;
    } else {
      // Auto-compile if not already compiled
      const compiled = compileMachine(machine);
      this.machine = machine;
      this.compiled = compiled.compiled;
    }

    this.options = options;
    this.namedGuards = this.machine.guards ?? {};
    this.namedActions = this.machine.actions ?? {};
    this.timers = new Map();
    this.running = false;

    // Create initial state from machine
    const initialState = createInitialState<TContext>(this.machine);

    // Initialize signal store with initial state and context
    this.store = createSignalStore<TContext>({
      initial: initialState.value,
      context: initialState.context,
    });
  }

  /**
   * Start the interpreter (async)
   */
  async start(): Promise<this> {
    if (this.running) return this;
    this.running = true;

    this.log("Starting machine", this.machine.id);

    // Execute entry actions for initial state
    const entryActions = this.getEntryActions(this.store.state.value);
    if (entryActions.length > 0) {
      await this.processActions(entryActions, { type: "xstate.init" });
    }

    // Check for always transitions
    await this.checkAlwaysTransitions();

    // Setup delayed transitions
    this.setupDelayedTransitions();

    return this;
  }

  /**
   * Stop the interpreter
   */
  stop(): this {
    this.running = false;
    this.clearAllTimers();
    this.log("Stopped machine", this.machine.id);
    return this;
  }

  /**
   * Send an event to the machine (async)
   */
  async send(event: Event | string): Promise<void> {
    if (!this.running) {
      console.warn("Cannot send event to stopped machine");
      return;
    }

    const normalizedEvent: Event = typeof event === "string" ? { type: event } : event;

    this.log("Received event", normalizedEvent.type);

    await this.transition(normalizedEvent);
  }

  /**
   * Get the current state as a plain snapshot (for compatibility)
   */
  getSnapshot(): State<TContext> {
    const snapshot = this.store.getSnapshot();
    return {
      value: snapshot.value,
      context: snapshot.context,
      done: snapshot.done,
      event: snapshot.event,
      // Note: history is not tracked in signal store
    } as State<TContext>;
  }

  /**
   * Check if current state matches a pattern
   */
  matches(pattern: string): boolean {
    return matchesState(this.store.state.value, pattern);
  }

  /**
   * Process a transition (async)
   */
  private async transition(event: Event): Promise<void> {
    const currentState = this.store.state.value;
    const activeNodes = getActiveStateNodes(this.machine, currentState);

    // Create guard context using current signal values
    const guardCtx = createGuardContext(
      {
        value: currentState,
        context: this.getPlainContext(),
        done: this.store.done.value,
        event,
      } as State,
      event,
      (pattern) => this.matches(pattern)
    );

    // Find matching transition
    let matchedTransition: Transition | undefined;
    let matchedNode: StateNode | undefined;

    // Check active state nodes (most specific first)
    for (const node of [...activeNodes].reverse()) {
      if (node.on && event.type in node.on) {
        const transitions = node.on[event.type];
        matchedTransition = findMatchingTransition(
          transitions,
          guardCtx,
          this.namedGuards,
          this.compiled
        );
        if (matchedTransition) {
          matchedNode = node;
          break;
        }
      }
    }

    // Check global handlers on machine
    if (!matchedTransition && this.machine.on && event.type in this.machine.on) {
      matchedTransition = findMatchingTransition(
        this.machine.on[event.type],
        guardCtx,
        this.namedGuards,
        this.compiled
      );
    }

    if (!matchedTransition) {
      this.log("No matching transition for", event.type);
      return;
    }

    // Execute the transition
    await this.executeTransition(matchedTransition, event, matchedNode);
  }

  /**
   * Execute a transition (async)
   */
  private async executeTransition(
    transition: Transition,
    event: Event,
    _sourceNode?: StateNode
  ): Promise<void> {
    const target = typeof transition === "string" ? transition : transition.target;
    const actions = typeof transition === "string" ? undefined : transition.actions;
    const internal = typeof transition === "string" ? false : (transition.internal ?? false);

    const previousValue = this.store.state.value;

    // Execute exit actions if changing state
    if (target && !internal) {
      const exitActions = this.getExitActions(previousValue);
      if (exitActions.length > 0) {
        await this.processActions(exitActions, event);
      }
    }

    // Execute transition actions
    if (actions) {
      await this.processActions(normalizeActions(actions), event);
    }

    // Update state value using batch for atomic update
    if (target) {
      const newStateValue = this.resolveTarget(target, previousValue);
      const isDone = this.isFinalState(target);

      // Batch state updates
      this.store.batch(() => {
        this.store.state.value = newStateValue;
        this.store.done.value = isDone;
        this.store.lastEvent.value = event as MachineEvent;
      });

      // Execute entry actions for new state
      if (!internal) {
        const entryActions = this.getEntryActions(newStateValue);
        if (entryActions.length > 0) {
          await this.processActions(entryActions, event);
        }
      }

      // Clear old timers and setup new ones
      this.clearAllTimers();
      this.setupDelayedTransitions();

      this.log("Transitioned to", toStateString(newStateValue));
    } else {
      // Self-transition without target - just update event
      this.store.lastEvent.value = event as MachineEvent;
    }

    // Check for always transitions
    await this.checkAlwaysTransitions();

    // Notify callbacks
    if (this.options.onTransition) {
      this.options.onTransition(this.getSnapshot());
    }

    // Check if done
    if (this.store.done.value && this.options.onDone) {
      this.options.onDone(this.getSnapshot());
    }
  }

  /**
   * Process actions and update signals (async)
   *
   * Context updates are batched so subscribers only see one update
   * even when multiple context fields change.
   */
  private async processActions(actions: Action[], event: Event): Promise<void> {
    const ctx: ActionContext = {
      context: this.getPlainContext(),
      event,
      state: { value: this.store.state.value },
    };

    const result = await executeActions(actions, ctx, this.namedActions, this.compiled);

    // Batch all context signal updates together
    this.store.batch(() => {
      for (const [key, value] of Object.entries(result.context)) {
        const signal = (this.store.context as Record<string, { value: unknown }>)[key];
        if (signal) {
          signal.value = value;
        }
      }
    });

    // Process raised events immediately
    for (const raisedEvent of result.raisedEvents) {
      await this.transition(raisedEvent);
    }

    // Process sent events (with optional delay)
    for (const { event: sentEvent, delay } of result.sentEvents) {
      if (delay && delay > 0) {
        setTimeout(() => this.send(sentEvent), delay);
      } else {
        // Queue for next tick to avoid stack overflow
        queueMicrotask(() => this.send(sentEvent));
      }
    }

    // Execute side effects (async but don't block)
    for (const effect of result.effects) {
      await this.executeEffect(effect);
    }
  }

  /**
   * Execute a side effect (async)
   */
  private async executeEffect(effect: ActionEffect): Promise<void> {
    this.log("Executing effect", effect.type);

    if (this.options.execute) {
      try {
        await this.options.execute(effect);
      } catch (error) {
        console.error("Effect execution failed:", effect.type, error);
      }
    }
  }

  /**
   * Get plain context object from signals
   */
  private getPlainContext(): TContext {
    const context = {} as TContext;
    for (const [key, signal] of Object.entries(this.store.context)) {
      (context as Record<string, unknown>)[key] = (signal as { value: unknown }).value;
    }
    return context;
  }

  /**
   * Get entry actions for a state value
   */
  private getEntryActions(value: StateValue): Action[] {
    const actions: Action[] = [];
    const nodes = getActiveStateNodes(this.machine, value);

    for (const node of nodes) {
      if (node.entry) {
        actions.push(...normalizeActions(node.entry));
      }
    }

    return actions;
  }

  /**
   * Get exit actions for a state value
   */
  private getExitActions(value: StateValue): Action[] {
    const actions: Action[] = [];
    const nodes = getActiveStateNodes(this.machine, value);

    // Exit in reverse order (most specific first)
    for (const node of [...nodes].reverse()) {
      if (node.exit) {
        actions.push(...normalizeActions(node.exit));
      }
    }

    return actions;
  }

  /**
   * Check and execute always transitions (async)
   */
  private async checkAlwaysTransitions(): Promise<void> {
    const nodes = getActiveStateNodes(this.machine, this.store.state.value);
    const guardCtx = createGuardContext(
      {
        value: this.store.state.value,
        context: this.getPlainContext(),
        done: this.store.done.value,
      } as State,
      { type: "" },
      (pattern) => this.matches(pattern)
    );

    for (const node of nodes) {
      if (node.always) {
        for (const transition of node.always) {
          const matched = findMatchingTransition(
            transition,
            guardCtx,
            this.namedGuards,
            this.compiled
          );
          if (matched) {
            await this.executeTransition(matched, { type: "" }, node);
            return; // Only execute first match
          }
        }
      }
    }
  }

  /**
   * Setup delayed transitions
   */
  private setupDelayedTransitions(): void {
    const nodes = getActiveStateNodes(this.machine, this.store.state.value);

    for (const node of nodes) {
      if (node.after) {
        for (const [delay, transition] of Object.entries(node.after)) {
          const delayMs = parseInt(delay, 10);
          if (Number.isNaN(delayMs)) continue;

          const timerId = setTimeout(async () => {
            const guardCtx = createGuardContext(
              {
                value: this.store.state.value,
                context: this.getPlainContext(),
                done: this.store.done.value,
              } as State,
              { type: `xstate.after.${delay}` },
              (pattern) => this.matches(pattern)
            );

            const matched = findMatchingTransition(
              transition,
              guardCtx,
              this.namedGuards,
              this.compiled
            );

            if (matched) {
              await this.executeTransition(matched, { type: `xstate.after.${delay}` }, node);
            }
          }, delayMs);

          this.timers.set(`after.${delay}`, timerId);
        }
      }
    }
  }

  /**
   * Clear all timers
   */
  private clearAllTimers(): void {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
  }

  /**
   * Resolve a target string to a state value
   */
  private resolveTarget(target: string, current: StateValue): StateValue {
    // Handle state ID reference (#id)
    if (target.startsWith("#")) {
      const id = target.slice(1);
      const found = this.findStateById(this.machine.states, id);
      if (found) return found;
    }

    // Handle relative child reference (.child)
    if (target.startsWith(".")) {
      const child = target.slice(1);
      if (typeof current === "string") {
        return { [current]: child };
      }
      // For nested current, append to the deepest
      return this.appendToDeepest(current, child);
    }

    // Simple sibling reference - replace leaf in nested state
    if (typeof current === "object") {
      return this.replaceLeaf(current, target);
    }

    return target;
  }

  /**
   * Replace the deepest leaf in a nested state value
   */
  private replaceLeaf(value: StateValue, newLeaf: string): StateValue {
    if (typeof value === "string") {
      return newLeaf;
    }
    const entries = Object.entries(value);
    if (entries.length === 1) {
      const entry = entries[0]!;
      const key = entry[0];
      const childValue = entry[1];
      return { [key]: this.replaceLeaf(childValue, newLeaf) };
    }
    // For parallel states, can't replace leaf
    return value;
  }

  /**
   * Find a state by ID
   */
  private findStateById(
    states: Record<string, StateNode>,
    id: string,
    path: string[] = []
  ): StateValue | undefined {
    for (const [name, state] of Object.entries(states)) {
      if (state.id === id) {
        return path.length === 0 ? name : this.buildNestedValue([...path, name]);
      }
      if (state.states) {
        const found = this.findStateById(state.states, id, [...path, name]);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * Build nested state value from path
   */
  private buildNestedValue(path: string[]): StateValue {
    if (path.length === 0) return "";
    if (path.length === 1) return path[0]!;
    const first = path[0]!;
    const rest = path.slice(1);
    return { [first]: this.buildNestedValue(rest) };
  }

  /**
   * Append a child to the deepest part of a state value
   */
  private appendToDeepest(value: StateValue, child: string): StateValue {
    if (typeof value === "string") {
      return { [value]: child };
    }
    const entries = Object.entries(value);
    if (entries.length === 1) {
      const entry = entries[0]!;
      const key = entry[0];
      const childValue = entry[1];
      return { [key]: this.appendToDeepest(childValue, child) };
    }
    return value;
  }

  /**
   * Check if a state is final
   */
  private isFinalState(target: string): boolean {
    const state = this.machine.states[target];
    return state?.type === "final";
  }

  /**
   * Log debug messages
   */
  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log(`[${this.machine.id}]`, ...args);
    }
  }
}

/**
 * Create a signal-aware interpreter for a machine
 */
export function interpretWithSignals<
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(machine: Machine | CompiledMachine, options?: SignalInterpreterOptions): SignalInterpreter<TContext> {
  return new SignalInterpreter<TContext>(machine, options);
}
