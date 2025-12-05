import { signal, effect, type ReadonlySignal } from "@preact/signals-core";
import { compileExpression, type CompiledJSONataExpression } from "../evaluate";
import { evaluateWithSignals, trackSignals } from "./evaluate";
import type { ReactiveBinding, SignalScope, CreateBindingOptions } from "./types";

/**
 * Creates a reactive binding from a JSONata expression.
 *
 * The binding:
 * - Compiles the expression once
 * - Tracks which context signals the expression depends on
 * - Re-evaluates when those signals change
 * - Provides loading/error state for async evaluation
 *
 * @example
 * ```typescript
 * const binding = createBinding("context.count * 2", signalScope);
 *
 * // Access computed value
 * console.log(binding.value.value); // 10
 *
 * // Check loading state
 * console.log(binding.loading.value); // false
 *
 * // Dispose when done
 * binding.dispose();
 * ```
 */
export function createBinding<TContext extends Record<string, unknown>>(
  expression: string,
  signalScope: SignalScope<TContext>,
  options: CreateBindingOptions = {}
): ReactiveBinding {
  // Compile the expression once
  const compiled = compileExpression(expression);
  return createBindingFromCompiled(compiled, signalScope, options);
}

/**
 * Creates a reactive binding from a pre-compiled expression.
 * Use this when you've already compiled the expression elsewhere.
 */
export function createBindingFromCompiled<TContext extends Record<string, unknown>>(
  compiled: CompiledJSONataExpression,
  signalScope: SignalScope<TContext>,
  options: CreateBindingOptions = {}
): ReactiveBinding {
  const { onChange, onError } = options;

  // Result signals
  const value = signal<unknown>(undefined);
  const loading = signal(true);
  const error = signal<Error | undefined>(undefined);

  /**
   * Evaluate the expression and update the value signal
   */
  async function evaluate(): Promise<void> {
    loading.value = true;
    error.value = undefined;

    try {
      const result = await evaluateWithSignals(compiled, signalScope);
      value.value = result;
      onChange?.(result);
    } catch (err) {
      const evalError = err instanceof Error ? err : new Error(String(err));
      error.value = evalError;
      onError?.(evalError);
    } finally {
      loading.value = false;
    }
  }

  // Create effect that tracks dependencies and triggers re-evaluation
  const disposeEffect = effect(() => {
    // Track all signals to establish subscriptions
    trackSignals(signalScope);

    // Schedule async evaluation
    evaluate();
  });

  return {
    value: value as ReadonlySignal<unknown>,
    loading: loading as ReadonlySignal<boolean>,
    error: error as ReadonlySignal<Error | undefined>,
    dispose() {
      disposeEffect();
    },
  };
}

/**
 * Dispose multiple bindings at once
 */
export function disposeBindings(bindings: ReactiveBinding[]): void {
  for (const binding of bindings) {
    binding.dispose();
  }
}
