import type { Signal, ReadonlySignal } from "@preact/signals-core";
import type { StateValue } from "../interpreter/state";

/**
 * Event object for state machine transitions
 */
export interface MachineEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Signal store for state machine - provides fine-grained reactivity
 * where consumers only re-render when their specific dependencies change.
 */
export interface SignalStore<TContext extends Record<string, unknown>> {
  /** Current state value (string or nested object for hierarchical states) */
  readonly state: Signal<StateValue>;

  /** Context fields as individual signals for fine-grained updates */
  readonly context: SignalContext<TContext>;

  /** Whether machine has reached a final state */
  readonly done: Signal<boolean>;

  /** Event that caused the last transition */
  readonly lastEvent: Signal<MachineEvent | undefined>;

  /** Get plain object snapshot (for debugging, serialization) */
  getSnapshot(): SignalStoreSnapshot<TContext>;

  /** Batch multiple updates into single notification */
  batch(fn: () => void): void;

  /** Dispose all signals and cleanup */
  dispose(): void;
}

/**
 * Maps each context field to its own signal for independent reactivity.
 * Updating `context.count` won't notify subscribers of `context.name`.
 */
export type SignalContext<T> = {
  readonly [K in keyof T]: Signal<T[K]>;
};

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
