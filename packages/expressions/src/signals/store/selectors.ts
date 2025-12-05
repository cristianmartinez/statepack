import { createBinding } from "../binding";
import type {
  ReactiveBinding,
  SignalScope,
  SignalLike,
  SignalContext,
} from "../types";

/**
 * A computed selector - a reactive binding to a JSONata expression.
 */
export type ComputedSelector<T = unknown> = ReactiveBinding<T>;

/**
 * Any object that provides context as signals.
 * Works with ContextStore, SignalStore, or any compatible object.
 */
export interface HasSignalContext<TContext extends Record<string, unknown>> {
  readonly context: SignalContext<TContext>;
}

/**
 * Options for creating selectors
 */
export interface CreateSelectorsOptions<
  TContext extends Record<string, unknown>,
  TDefinitions extends Record<string, string> = Record<string, string>,
> {
  /** Selector definitions: name -> JSONata expression */
  definitions: TDefinitions;
  /** Any object with context as signals (ContextStore, SignalStore, etc.) */
  store: HasSignalContext<TContext>;
  /** Optional: already-computed selectors (for dependencies between selectors) */
  existingSelectors?: Record<string, ComputedSelector>;
}

/**
 * Maps selector definitions to ComputedSelector types
 */
export type SelectorsFromDefinitions<T extends Record<string, string>> = {
  [K in keyof T]: ComputedSelector;
};

/**
 * Creates computed selectors from JSONata expressions.
 *
 * Each selector:
 * - Tracks which context signals it depends on
 * - Re-evaluates when those signals change
 * - Provides loading/error state for async evaluation
 *
 * @example
 * ```typescript
 * const store = createContextStore({ context: { count: 5, name: "Alice" } });
 *
 * const selectors = createSelectors({
 *   definitions: {
 *     doubled: "context.count * 2",
 *     greeting: "'Hello, ' & context.name",
 *   },
 *   store,
 * });
 *
 * // Access computed values
 * console.log(selectors.doubled.value.value); // 10
 * console.log(selectors.greeting.value.value); // "Hello, Alice"
 * ```
 */
export function createSelectors<
  TContext extends Record<string, unknown>,
  TDefinitions extends Record<string, string>,
>(
  options: CreateSelectorsOptions<TContext, TDefinitions>
): SelectorsFromDefinitions<TDefinitions> {
  const { definitions, store, existingSelectors = {} } = options;
  const selectors: Record<string, ComputedSelector> = { ...existingSelectors };

  for (const [name, expression] of Object.entries(definitions)) {
    selectors[name] = createSelector(expression, store, selectors);
  }

  return selectors as SelectorsFromDefinitions<TDefinitions>;
}

/**
 * Converts a store with context signals to a SignalScope for binding evaluation.
 */
function toSignalScope<TContext extends Record<string, unknown>>(
  store: HasSignalContext<TContext>,
  selectors: Record<string, ComputedSelector> = {}
): SignalScope<TContext> {
  // Convert selector bindings to the format expected by SignalScope
  const selectorSignals: Record<string, { value: SignalLike<unknown> }> = {};
  for (const [key, selector] of Object.entries(selectors)) {
    selectorSignals[key] = { value: selector.value };
  }

  return {
    context: store.context,
    selectors: selectorSignals,
  };
}

/**
 * Creates a single computed selector from a JSONata expression.
 */
export function createSelector<TContext extends Record<string, unknown>>(
  expression: string,
  store: HasSignalContext<TContext>,
  selectors: Record<string, ComputedSelector> = {}
): ComputedSelector {
  const signalScope = toSignalScope(store, selectors);
  return createBinding(expression, signalScope);
}

/**
 * Dispose all selectors in a collection
 */
export function disposeSelectors(selectors: Record<string, ComputedSelector>): void {
  for (const selector of Object.values(selectors)) {
    selector.dispose();
  }
}
