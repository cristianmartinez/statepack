import { signal, effect, type ReadonlySignal, type Signal } from "@preact/signals-core";

/**
 * Options for computedAsync
 */
export interface ComputedAsyncOptions<T> {
  /** Initial value before first evaluation completes */
  initial?: T;
  /** Keep old value while re-evaluating (default: true) */
  staleWhileRevalidate?: boolean;
}

/**
 * A computed value from an async function.
 * Tracks signal dependencies automatically and re-evaluates when they change.
 */
export interface ComputedAsync<T> {
  /** Current computed value (or initial/undefined until first evaluation) */
  readonly value: T | undefined;
  /** Whether currently evaluating */
  readonly loading: boolean;
  /** Last error if evaluation failed */
  readonly error: Error | undefined;
  /** Dispose and stop tracking */
  dispose(): void;
}

/**
 * Create a computed value from an async function.
 *
 * The function is called inside an effect, so any signal `.value` reads
 * are automatically tracked as dependencies. When those signals change,
 * the function re-runs.
 *
 * **IMPORTANT**: Signal reads must happen BEFORE any `await` for tracking to work.
 * This is because Preact Signals only tracks synchronous reads within an effect.
 *
 * @example
 * ```typescript
 * const count = signal(0);
 *
 * // CORRECT: Signal read happens before await
 * const doubled = computedAsync(async () => {
 *   const scope = { context: { count: count.value } }; // Read BEFORE await
 *   return await evaluate("context.count * 2", scope);
 * });
 *
 * // WRONG: Signal read happens after await - won't track!
 * const broken = computedAsync(async () => {
 *   await someAsyncSetup();
 *   return count.value * 2; // Too late - not tracked
 * });
 * ```
 *
 * @example Composing computedAsync values
 * ```typescript
 * const items = signal([1, 2, 3]);
 *
 * const filtered = computedAsync(async () => {
 *   const arr = items.value; // Read before any await
 *   return arr.filter(x => x > 1);
 * });
 *
 * const count = computedAsync(async () => {
 *   const arr = filtered.value; // Read before any await
 *   return arr ? arr.length : 0;
 * });
 * ```
 */
export function computedAsync<T>(
  fn: () => Promise<T>,
  options: ComputedAsyncOptions<T> = {}
): ComputedAsync<T> {
  const { initial, staleWhileRevalidate = true } = options;

  const _value: Signal<T | undefined> = signal(initial);
  const _loading: Signal<boolean> = signal(true);
  const _error: Signal<Error | undefined> = signal(undefined);

  let evaluationId = 0;

  const disposeEffect = effect(() => {
    const thisEvalId = ++evaluationId;
    _loading.value = true;
    _error.value = undefined;

    // Clear value if not keeping stale
    if (!staleWhileRevalidate) {
      _value.value = initial;
    }

    // Call fn() synchronously to track signal reads
    // The promise is handled asynchronously
    fn()
      .then((result) => {
        // Only update if this is still the latest evaluation
        if (thisEvalId === evaluationId) {
          _value.value = result;
        }
      })
      .catch((err) => {
        if (thisEvalId === evaluationId) {
          _error.value = err instanceof Error ? err : new Error(String(err));
        }
      })
      .finally(() => {
        if (thisEvalId === evaluationId) {
          _loading.value = false;
        }
      });
  });

  return {
    get value() {
      return _value.value;
    },
    get loading() {
      return _loading.value;
    },
    get error() {
      return _error.value;
    },
    dispose() {
      disposeEffect();
    },
  };
}

/**
 * Create a computed value from an async function with typed value signal.
 * Same as computedAsync but returns signal references for direct subscription.
 */
export function computedAsyncSignals<T>(
  fn: () => Promise<T>,
  options: ComputedAsyncOptions<T> = {}
): {
  value: ReadonlySignal<T | undefined>;
  loading: ReadonlySignal<boolean>;
  error: ReadonlySignal<Error | undefined>;
  dispose: () => void;
} {
  const { initial, staleWhileRevalidate = true } = options;

  const _value: Signal<T | undefined> = signal(initial);
  const _loading: Signal<boolean> = signal(true);
  const _error: Signal<Error | undefined> = signal(undefined);

  let evaluationId = 0;

  const disposeEffect = effect(() => {
    const thisEvalId = ++evaluationId;
    _loading.value = true;
    _error.value = undefined;

    if (!staleWhileRevalidate) {
      _value.value = initial;
    }

    fn()
      .then((result) => {
        if (thisEvalId === evaluationId) {
          _value.value = result;
        }
      })
      .catch((err) => {
        if (thisEvalId === evaluationId) {
          _error.value = err instanceof Error ? err : new Error(String(err));
        }
      })
      .finally(() => {
        if (thisEvalId === evaluationId) {
          _loading.value = false;
        }
      });
  });

  return {
    value: _value as ReadonlySignal<T | undefined>,
    loading: _loading as ReadonlySignal<boolean>,
    error: _error as ReadonlySignal<Error | undefined>,
    dispose: disposeEffect,
  };
}
