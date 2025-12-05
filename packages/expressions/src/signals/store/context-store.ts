import { signal, batch as signalBatch } from "@preact/signals-core";
import type {
  ContextStore,
  SignalContext,
  CreateContextStoreOptions,
} from "../types";

/**
 * Creates a context store with signals for fine-grained reactivity.
 *
 * Each top-level context field becomes an independent signal:
 * - Updating one field doesn't notify subscribers of other fields
 * - Use `batch()` to group multiple updates into a single notification
 *
 * @example
 * ```typescript
 * const store = createContextStore({
 *   context: { count: 0, name: "test" }
 * });
 *
 * // Subscribe to specific field
 * effect(() => {
 *   console.log("Count changed:", store.context.count.value);
 * });
 *
 * // Update only triggers subscribers of count, not name
 * store.context.count.value = 1;
 * ```
 */
export function createContextStore<TContext extends Record<string, unknown>>(
  options: CreateContextStoreOptions<TContext>
): ContextStore<TContext> {
  // Create individual signal for each context field
  const context = {} as SignalContext<TContext>;
  for (const [key, value] of Object.entries(options.context)) {
    (context as Record<string, unknown>)[key] = signal(value);
  }

  return {
    context,

    getSnapshot() {
      const contextSnapshot = {} as TContext;
      for (const key of Object.keys(options.context)) {
        const sig = (context as Record<string, { value: unknown }>)[key];
        if (sig) {
          (contextSnapshot as Record<string, unknown>)[key] = sig.value;
        }
      }
      return { context: contextSnapshot };
    },

    batch(fn: () => void) {
      signalBatch(fn);
    },

    dispose() {
      // Signals are garbage collected when no references remain.
      // Hook for future cleanup needs.
    },
  };
}
