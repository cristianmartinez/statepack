import {
  type CompiledStore,
  type SignalStoreInstance,
  type SignalContext,
  createSignalStoreInstance,
  getSignalContextSnapshot,
  getSignalStoreSnapshot,
  updateSignalContext,
  buildSignalScope,
} from "@ouni/data";
import type { SignalScope } from "@ouni/expressions";
import { signal, batch as signalBatch, type Signal } from "@preact/signals-core";
import { compileMachine, type CompiledCache, type CompiledMachine } from "../compiler";
import { isCompiledMachine } from "../compiler/types";
import type {
  Action,
  GuardDefinition,
  Invoke,
  InvokeSource,
  Machine,
  StateNode,
  Transition,
} from "../schema/types";
import { type ActionContext, type ActionEffect, executeActions, normalizeActions } from "./actions";
import { createGuardContext, findMatchingTransition } from "./guards";
import {
  createInitialState,
  type Event,
  getActiveStateNodes,
  matchesState,
  type State,
  type StateValue,
  toStateString,
} from "./state";

/**
 * Options for the interpreter
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
  /** Parent store for scope hierarchy */
  parentStore?: SignalStoreInstance;
  /** Named stores for $[name] access */
  namedStores?: Map<string, SignalStoreInstance>;
}

/**
 * State machine interpreter.
 *
 * Manages state machine execution with Store-based data management.
 * The store contains named slices, each with context, queries, and mutations.
 *
 * @example
 * ```typescript
 * const interpreter = new SignalInterpreter(machine);
 * await interpreter.start();
 *
 * // Get current state
 * console.log("State:", interpreter.state.value);
 * console.log("Store:", interpreter.store);
 *
 * // Send event
 * await interpreter.send("INCREMENT");
 * ```
 */
export class SignalInterpreter {
  private machine: Machine;
  private options: SignalInterpreterOptions;
  private namedGuards: Record<string, GuardDefinition>;
  private namedActions: Record<string, Action | Action[]>;
  private timers: Map<string, ReturnType<typeof setTimeout>>;
  private running: boolean;
  private compiled?: CompiledCache;
  private compiledStore?: CompiledStore;

  /** Current state value signal */
  readonly state: Signal<StateValue>;

  /** Whether machine has reached a final state */
  readonly done: Signal<boolean>;

  /** Event that caused the last transition */
  readonly lastEvent: Signal<Event | undefined>;

  /** Metadata from current state(s) */
  private _meta: Record<string, unknown>;

  /** Active child machine actors */
  private _children: Map<string, unknown>;

  /** Store instance with signal-based context values */
  private _store?: SignalStoreInstance;

  /** Active invoked services (intervals, timeouts, etc.) */
  private services: Map<string, { cleanup: () => void }>;

  constructor(machine: Machine | CompiledMachine, options: SignalInterpreterOptions = {}) {
    // Extract source machine and compiled cache
    if (isCompiledMachine(machine)) {
      this.machine = machine.source;
      this.compiled = machine.compiled;
      this.compiledStore = machine.store;
    } else {
      // Auto-compile if not already compiled
      const compiled = compileMachine(machine);
      this.machine = machine;
      this.compiled = compiled.compiled;
      this.compiledStore = compiled.store;
    }

    this.options = options;
    this.namedGuards = this.machine.guards ?? {};
    this.namedActions = this.machine.actions ?? {};
    this.timers = new Map();
    this.services = new Map();
    this.running = false;

    // Create signal store instance if store is defined
    if (this.compiledStore) {
      this._store = createSignalStoreInstance(this.compiledStore, {
        parent: options.parentStore as SignalStoreInstance | undefined,
      });
    }

    // Create initial state from machine
    const initialState = createInitialState(this.machine);

    // Initialize state signals
    this.state = signal(initialState.value);
    this.done = signal(false);
    this.lastEvent = signal<Event | undefined>(undefined);

    // Initialize meta and children from initial state
    this._meta = initialState.meta;
    this._children = initialState.children;
  }

  /** Get the store instance */
  get store(): SignalStoreInstance | undefined {
    return this._store;
  }

  /** Get signal context for fine-grained subscriptions */
  get signalContext(): Map<string, SignalContext<Record<string, unknown>>> | undefined {
    return this._store?.contexts;
  }

  /**
   * Get signal scope for use with computedAsync/useComputedBinding.
   * Returns a SignalScope compatible with @ouni/expressions.
   *
   * @param sliceName - Optional slice name. Defaults to first slice if only one exists.
   */
  getSignalScope(sliceName?: string): SignalScope | null {
    if (!this._store) return null;

    // Determine which slice to use
    let targetSlice = sliceName;
    if (!targetSlice && this._store.contexts.size === 1) {
      [targetSlice] = this._store.contexts.keys();
    }

    if (!targetSlice) return null;

    return buildSignalScope(this._store, targetSlice);
  }

  /**
   * Get context from a slice (defaults to first slice if only one exists)
   */
  getSliceContext(sliceName?: string): Record<string, unknown> | undefined {
    if (!this._store) return undefined;

    if (sliceName) {
      return getSignalContextSnapshot(this._store, sliceName);
    }

    // If only one slice, return its context
    if (this._store.contexts.size === 1) {
      const [onlySlice] = this._store.contexts.keys();
      return getSignalContextSnapshot(this._store, onlySlice!);
    }

    return undefined;
  }

  /**
   * Get all contexts as a flat object (for backward compatibility)
   * Merges all slice contexts into one object
   */
  get context(): Record<string, unknown> {
    if (!this._store) return {};
    return getSignalStoreSnapshot(this._store);
  }

  /**
   * Get all query values as a flat object
   */
  get queries(): Record<string, unknown> {
    if (!this._store) return {};
    const queries: Record<string, unknown> = {};
    for (const sliceQueries of this._store.queries.values()) {
      for (const [queryName, binding] of sliceQueries) {
        queries[queryName] = binding.value.value;
      }
    }
    return queries;
  }

  /**
   * Start the interpreter (async)
   */
  async start(): Promise<this> {
    if (this.running) return this;
    this.running = true;

    this.log("Starting machine", this.machine.id);

    // Execute entry actions for initial state
    const entryActions = this.getEntryActions(this.state.value);
    if (entryActions.length > 0) {
      await this.processActions(entryActions, { type: "xstate.init" });
    }

    // Check for always transitions
    await this.checkAlwaysTransitions();

    // Setup delayed transitions and invoked services
    this.setupDelayedTransitions();
    this.setupInvokedServices();

    return this;
  }

  /**
   * Stop the interpreter
   */
  stop(): this {
    this.running = false;
    this.clearAllTimers();
    this.stopAllServices();
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
   * Get the current state as a plain snapshot
   */
  getSnapshot(): State {
    return {
      value: this.state.value,
      context: this.context,
      done: this.done.value,
      event: this.lastEvent.value,
      meta: this._meta,
      children: this._children,
    };
  }

  /**
   * Check if current state matches a pattern
   */
  matches(pattern: string): boolean {
    return matchesState(this.state.value, pattern);
  }

  /**
   * Process a transition (async)
   */
  private async transition(event: Event): Promise<void> {
    const currentState = this.state.value;
    const activeNodes = getActiveStateNodes(this.machine, currentState);

    // Create guard context
    const guardCtx = createGuardContext(
      {
        value: currentState,
        context: this.context,
        done: this.done.value,
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

    const previousValue = this.state.value;

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
      signalBatch(() => {
        this.state.value = newStateValue;
        this.done.value = isDone;
        this.lastEvent.value = event;
      });

      // Execute entry actions for new state
      if (!internal) {
        const entryActions = this.getEntryActions(newStateValue);
        if (entryActions.length > 0) {
          await this.processActions(entryActions, event);
        }
      }

      // Clear old timers/services and setup new ones
      this.clearAllTimers();
      this.stopAllServices();
      this.setupDelayedTransitions();
      this.setupInvokedServices();

      this.log("Transitioned to", toStateString(newStateValue));
    } else {
      // Self-transition without target - just update event
      this.lastEvent.value = event;
    }

    // Check for always transitions
    await this.checkAlwaysTransitions();

    // Notify callbacks
    if (this.options.onTransition) {
      this.options.onTransition(this.getSnapshot());
    }

    // Check if done
    if (this.done.value && this.options.onDone) {
      this.options.onDone(this.getSnapshot());
    }
  }

  /**
   * Process actions and update context (async)
   */
  private async processActions(actions: Action[], event: Event): Promise<void> {
    const ctx: ActionContext = {
      context: this.context,
      event,
      state: { value: this.state.value },
    };

    const result = await executeActions(actions, ctx, {
      namedActions: this.namedActions,
      store: this._store,
      compiled: this.compiled,
      namedStores: this.options.namedStores,
    });

    // Update store contexts with results using signal updates
    if (this._store && Object.keys(result.context).length > 0) {
      // For single-slice store, update that slice
      if (this._store.contexts.size === 1) {
        const [sliceName] = this._store.contexts.keys();
        updateSignalContext(this._store, sliceName!, result.context);
      } else {
        // Multi-slice: results should specify which slice to update
        // For now, merge into all slices (TODO: improve this)
        for (const sliceName of this._store.contexts.keys()) {
          updateSignalContext(this._store, sliceName, result.context);
        }
      }
    }

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
    const nodes = getActiveStateNodes(this.machine, this.state.value);
    const guardCtx = createGuardContext(
      {
        value: this.state.value,
        context: this.context,
        done: this.done.value,
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
    const nodes = getActiveStateNodes(this.machine, this.state.value);

    for (const node of nodes) {
      if (node.after) {
        for (const [delay, transition] of Object.entries(node.after)) {
          const delayMs = parseInt(delay, 10);
          if (Number.isNaN(delayMs)) continue;

          const timerId = setTimeout(async () => {
            const guardCtx = createGuardContext(
              {
                value: this.state.value,
                context: this.context,
                done: this.done.value,
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
   * Setup invoked services for the current state
   */
  private setupInvokedServices(): void {
    const nodes = getActiveStateNodes(this.machine, this.state.value);

    for (const node of nodes) {
      if (node.invoke) {
        const invokes: Invoke[] = Array.isArray(node.invoke) ? node.invoke : [node.invoke];

        for (const invoke of invokes) {
          this.startService(invoke);
        }
      }
    }
  }

  /**
   * Start an invoked service
   */
  private startService(invoke: Invoke): void {
    const src = invoke.src;
    const serviceId = invoke.id || `service.${Math.random().toString(36).slice(2)}`;

    // Skip string references (not implemented yet)
    if (typeof src === "string") {
      this.log("Named service references not implemented:", src);
      return;
    }

    const srcObj = src as InvokeSource;
    if (typeof srcObj !== "object" || !("type" in srcObj)) return;

    switch (srcObj.type) {
      case "interval": {
        const intervalSrc = srcObj as { type: "interval"; ms: number; event: string };
        const intervalId = setInterval(() => {
          if (this.running) {
            this.send({ type: intervalSrc.event });
          }
        }, intervalSrc.ms);

        this.services.set(serviceId, {
          cleanup: () => clearInterval(intervalId),
        });
        this.log("Started interval service", serviceId, `${intervalSrc.ms}ms`);
        break;
      }

      case "timeout": {
        const timeoutSrc = srcObj as { type: "timeout"; ms: number; event: string };
        const timeoutId = setTimeout(() => {
          if (this.running) {
            this.send({ type: timeoutSrc.event });
          }
        }, timeoutSrc.ms);

        this.services.set(serviceId, {
          cleanup: () => clearTimeout(timeoutId),
        });
        this.log("Started timeout service", serviceId, `${timeoutSrc.ms}ms`);
        break;
      }

      case "fetch": {
        // Fetch services are handled elsewhere (or could be added here)
        this.log("Fetch service not implemented in invoke:", serviceId);
        break;
      }
    }
  }

  /**
   * Stop all active services
   */
  private stopAllServices(): void {
    for (const [id, service] of this.services) {
      service.cleanup();
      this.log("Stopped service", id);
    }
    this.services.clear();
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
 * Create an interpreter for a machine
 */
export function interpretWithSignals(
  machine: Machine | CompiledMachine,
  options?: SignalInterpreterOptions
): SignalInterpreter {
  return new SignalInterpreter(machine, options);
}
