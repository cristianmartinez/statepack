import type { Signal, ReadonlySignal } from "@preact/signals-core";

/**
 * A signal-like object that can be read
 */
export interface SignalLike<T = unknown> {
  readonly value: T;
}

/**
 * A writable signal
 */
export interface WritableSignal<T = unknown> extends SignalLike<T> {
  value: T;
}

/**
 * Context represented as signals - each top-level key is a signal
 */
export type SignalContext<T extends Record<string, unknown> = Record<string, unknown>> = {
  [K in keyof T]: Signal<T[K]>;
};

/**
 * Scope with signal-based context for reactive evaluation
 */
export interface SignalScope<TContext extends Record<string, unknown> = Record<string, unknown>> {
  context: SignalContext<TContext>;
  /** Derived computed values (selectors/queries) */
  selectors?: Record<string, { value: SignalLike<unknown> }>;
  /** Query results as signals */
  queries?: Record<string, SignalLike<unknown>>;
  /** Machine state signal (for state machine integrations) */
  state?: SignalLike<unknown>;
}

/**
 * Plain object snapshot of context values
 */
export interface ContextSnapshot<TContext> {
  context: TContext;
}

/**
 * Options for creating a context store
 */
export interface CreateContextStoreOptions<TContext extends Record<string, unknown>> {
  context: TContext;
}

/**
 * A store that wraps context in signals for fine-grained reactivity.
 * Each top-level context field is an independent signal.
 */
export interface ContextStore<TContext extends Record<string, unknown>> {
  /** Context fields as individual signals */
  readonly context: SignalContext<TContext>;

  /** Get plain object snapshot of current context values */
  getSnapshot(): ContextSnapshot<TContext>;

  /** Batch multiple updates into single notification */
  batch(fn: () => void): void;

  /** Dispose and cleanup */
  dispose(): void;
}

/**
 * Result of a reactive binding
 */
export interface ReactiveBinding<T = unknown> {
  /** Current computed value (undefined until first evaluation completes) */
  readonly value: ReadonlySignal<T | undefined>;
  /** Whether the binding is currently computing */
  readonly loading: ReadonlySignal<boolean>;
  /** Any error from the last computation */
  readonly error: ReadonlySignal<Error | undefined>;
  /** Dispose the binding and stop tracking */
  dispose(): void;
}

/**
 * Options for creating a reactive binding
 */
export interface CreateBindingOptions {
  /** Optional callback when value changes */
  onChange?: (value: unknown) => void;
  /** Optional callback on error */
  onError?: (error: Error) => void;
}
