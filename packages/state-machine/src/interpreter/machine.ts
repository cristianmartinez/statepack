import type { Machine, StateNode, Action, GuardDefinition, Transition } from "../schema/types";
import {
  createInitialState,
  matchesState,
  getActiveStateNodes,
  toStateString,
  type State,
  type StateValue,
  type Event,
} from "./state";
import {
  evaluateGuard,
  findMatchingTransition,
  createGuardContext,
} from "./guards";
import {
  executeActions,
  normalizeActions,
  type ActionResult,
  type ActionEffect,
} from "./actions";

/**
 * Options for the interpreter
 */
export interface InterpreterOptions {
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
 * The state machine interpreter
 */
export class Interpreter<TContext extends Record<string, unknown> = Record<string, unknown>> {
  private machine: Machine;
  private state: State<TContext>;
  private options: InterpreterOptions;
  private namedGuards: Record<string, GuardDefinition>;
  private namedActions: Record<string, Action | Action[]>;
  private subscribers: Set<(state: State<TContext>) => void>;
  private timers: Map<string, ReturnType<typeof setTimeout>>;
  private running: boolean;

  constructor(machine: Machine, options: InterpreterOptions = {}) {
    this.machine = machine;
    this.options = options;
    this.namedGuards = machine.guards ?? {};
    this.namedActions = machine.actions ?? {};
    this.subscribers = new Set();
    this.timers = new Map();
    this.running = false;
    this.state = createInitialState<TContext>(machine);
  }

  /**
   * Start the interpreter
   */
  start(): this {
    if (this.running) return this;
    this.running = true;

    this.log("Starting machine", this.machine.id);

    // Execute entry actions for initial state
    const entryActions = this.getEntryActions(this.state.value);
    if (entryActions.length > 0) {
      this.processActions(entryActions, { type: "xstate.init" });
    }

    // Check for always transitions
    this.checkAlwaysTransitions();

    // Setup delayed transitions
    this.setupDelayedTransitions();

    this.notifySubscribers();

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
   * Send an event to the machine
   */
  send(event: Event | string): State<TContext> {
    if (!this.running) {
      console.warn("Cannot send event to stopped machine");
      return this.state;
    }

    const normalizedEvent: Event =
      typeof event === "string" ? { type: event } : event;

    this.log("Received event", normalizedEvent.type);

    return this.transition(normalizedEvent);
  }

  /**
   * Get the current state
   */
  getSnapshot(): State<TContext> {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: State<TContext>) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Check if current state matches a pattern
   */
  matches(pattern: string): boolean {
    return matchesState(this.state.value, pattern);
  }

  /**
   * Process a transition
   */
  private transition(event: Event): State<TContext> {
    const activeNodes = getActiveStateNodes(this.machine, this.state.value);
    const guardCtx = createGuardContext(
      this.state,
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
          this.namedGuards
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
        this.namedGuards
      );
    }

    if (!matchedTransition) {
      this.log("No matching transition for", event.type);
      return this.state;
    }

    // Execute the transition
    return this.executeTransition(matchedTransition, event, matchedNode);
  }

  /**
   * Execute a transition
   */
  private executeTransition(
    transition: Transition,
    event: Event,
    sourceNode?: StateNode
  ): State<TContext> {
    const target = typeof transition === "string" ? transition : transition.target;
    const actions =
      typeof transition === "string" ? undefined : transition.actions;
    const internal =
      typeof transition === "string" ? false : transition.internal ?? false;

    const previousValue = this.state.value;

    // Execute exit actions if changing state
    if (target && !internal) {
      const exitActions = this.getExitActions(previousValue);
      if (exitActions.length > 0) {
        this.processActions(exitActions, event);
      }
    }

    // Execute transition actions
    if (actions) {
      this.processActions(normalizeActions(actions), event);
    }

    // Update state value
    if (target) {
      this.state = {
        ...this.state,
        value: this.resolveTarget(target, previousValue),
        history: this.state,
        event,
        done: this.isFinalState(target),
        meta: this.collectMeta(this.resolveTarget(target, previousValue)),
      };

      // Execute entry actions for new state
      if (!internal) {
        const entryActions = this.getEntryActions(this.state.value);
        if (entryActions.length > 0) {
          this.processActions(entryActions, event);
        }
      }

      // Clear old timers and setup new ones
      this.clearAllTimers();
      this.setupDelayedTransitions();

      this.log("Transitioned to", toStateString(this.state.value));
    } else {
      // Self-transition without target
      this.state = { ...this.state, event };
    }

    // Check for always transitions
    this.checkAlwaysTransitions();

    // Notify subscribers
    this.notifySubscribers();

    // Check if done
    if (this.state.done && this.options.onDone) {
      this.options.onDone(this.state);
    }

    return this.state;
  }

  /**
   * Process actions and update state
   */
  private processActions(actions: Action[], event: Event): void {
    const ctx = {
      context: this.state.context,
      event,
      state: { value: this.state.value },
    };

    const result = executeActions(actions, ctx, this.namedActions);

    // Update context
    this.state = {
      ...this.state,
      context: result.context as TContext,
    };

    // Process raised events immediately
    for (const raisedEvent of result.raisedEvents) {
      this.transition(raisedEvent);
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

    // Execute side effects
    for (const effect of result.effects) {
      this.executeEffect(effect);
    }
  }

  /**
   * Execute a side effect
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
   * Check and execute always transitions
   */
  private checkAlwaysTransitions(): void {
    const nodes = getActiveStateNodes(this.machine, this.state.value);
    const guardCtx = createGuardContext(
      this.state,
      { type: "" },
      (pattern) => this.matches(pattern)
    );

    for (const node of nodes) {
      if (node.always) {
        for (const transition of node.always) {
          const matched = findMatchingTransition(
            transition,
            guardCtx,
            this.namedGuards
          );
          if (matched) {
            this.executeTransition(matched, { type: "" }, node);
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
    const nodes = getActiveStateNodes(this.machine, this.state.value);

    for (const node of nodes) {
      if (node.after) {
        for (const [delay, transition] of Object.entries(node.after)) {
          const delayMs = parseInt(delay, 10);
          if (isNaN(delayMs)) continue;

          const timerId = setTimeout(() => {
            const guardCtx = createGuardContext(
              this.state,
              { type: `xstate.after.${delay}` },
              (pattern) => this.matches(pattern)
            );

            const matched = findMatchingTransition(
              transition,
              guardCtx,
              this.namedGuards
            );

            if (matched) {
              this.executeTransition(
                matched,
                { type: `xstate.after.${delay}` },
                node
              );
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
   * Collect metadata from current state
   */
  private collectMeta(value: StateValue): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    const nodes = getActiveStateNodes(this.machine, value);

    for (const node of nodes) {
      if (node.meta) {
        Object.assign(meta, node.meta);
      }
    }

    return meta;
  }

  /**
   * Notify subscribers of state change
   */
  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      callback(this.state);
    }

    if (this.options.onTransition) {
      this.options.onTransition(this.state);
    }
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
 * Create an interpreter for a machine
 */
export function interpret<TContext extends Record<string, unknown> = Record<string, unknown>>(
  machine: Machine,
  options?: InterpreterOptions
): Interpreter<TContext> {
  return new Interpreter<TContext>(machine, options);
}
