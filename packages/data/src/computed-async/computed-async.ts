import { signal, effect, type Signal } from "@preact/signals-core";
import type { SignalLike } from "../signals";

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
 * Re-evaluates when any of the dependency signals change.
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
 * Create a computed signal from an async function with explicit signal dependencies.
 *
 * Low-level primitive that tracks the provided signals and re-evaluates
 * the async function when any of them change.
 *
 * @example
 * ```typescript
 * const price = signal(10);
 * const quantity = signal(2);
 *
 * const total = computedAsync(
 *   [price, quantity],
 *   async () => {
 *     const result = await calculateTotal(price.value, quantity.value);
 *     return result;
 *   }
 * );
 * ```
 */
export function computedAsync<T>(
  deps: SignalLike[],
  fn: () => Promise<T>,
  options: ComputedAsyncOptions<T> = {}
): ComputedAsync<T> {
  const { initial, staleWhileRevalidate = true } = options;

  const _value: Signal<T | undefined> = signal(initial);
  const _loading: Signal<boolean> = signal(true);
  const _error: Signal<Error | undefined> = signal(undefined);

  let evaluationId = 0;

  const disposeEffect = effect(() => {
    // Read all dependency signals to establish tracking
    for (const sig of deps) {
      sig.value;
    }

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
