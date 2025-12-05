import type { Signal, ReadonlySignal } from "@preact/signals-core";
import type { ContextStore } from "@ouni/expressions";
import type { StateValue } from "../interpreter/state";

// Re-export SignalContext from expressions for convenience
export type { SignalContext } from "@ouni/expressions";

/**
 * Event object for state machine transitions
 */
export interface MachineEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Signal store for state machine - extends ContextStore with machine-specific fields.
 * Provides fine-grained reactivity where consumers only re-render when their
 * specific dependencies change.
 */
export interface SignalStore<TContext extends Record<string, unknown>>
  extends ContextStore<TContext> {
  /** Current state value (string or nested object for hierarchical states) */
  readonly state: Signal<StateValue>;

  /** Whether machine has reached a final state */
  readonly done: Signal<boolean>;

  /** Event that caused the last transition */
  readonly lastEvent: Signal<MachineEvent | undefined>;

  /** Get plain object snapshot (for debugging, serialization) */
  getSnapshot(): SignalStoreSnapshot<TContext>;
}

/**
 * Plain object snapshot of signal store state.
 * Used for debugging, serialization, and interop with non-reactive code.
 */
export interface SignalStoreSnapshot<TContext> {
  /** Current state value */
  value: StateValue;
  /** Context as plain object */
  context: TContext;
  /** Whether machine is in final state */
  done: boolean;
  /** Last event that caused a transition */
  event?: MachineEvent;
}

/**
 * Options for creating a signal store
 */
export interface CreateSignalStoreOptions<TContext extends Record<string, unknown>> {
  /** Initial state value */
  initial: StateValue;
  /** Initial context values */
  context: TContext;
}

/**
 * Computed selector signal - read-only signal derived from other signals
 */
export type SelectorSignal<T> = ReadonlySignal<T>;

/**
 * Collection of computed selectors
 */
export type SignalSelectors = Record<string, ReadonlySignal<unknown>>;
