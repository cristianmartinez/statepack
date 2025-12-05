import { signal, batch as signalBatch } from "@preact/signals-core";
import type {
  SignalStore,
  SignalContext,
  CreateSignalStoreOptions,
  MachineEvent,
} from "./types";

/**
 * Creates a signal store for state machine state.
 *
 * The store wraps state machine state in signals for fine-grained reactivity:
 * - Each context field is an independent signal
 * - Updating one field doesn't notify subscribers of other fields
 * - State and done are separate signals from context
 *
 * @example
 * ```typescript
 * const store = createSignalStore({
 *   initial: "idle",
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
export function createSignalStore<TContext extends Record<string, unknown>>(
  options: CreateSignalStoreOptions<TContext>
): SignalStore<TContext> {
  // Core state signals
  const state = signal(options.initial);
  const done = signal(false);
  const lastEvent = signal<MachineEvent | undefined>(undefined);

  // Create individual signal for each context field
  const context = {} as SignalContext<TContext>;
  for (const [key, value] of Object.entries(options.context)) {
    (context as Record<string, unknown>)[key] = signal(value);
  }

  return {
    state,
    context,
    done,
    lastEvent,

    getSnapshot() {
      // Read all context signals into plain object
      const contextSnapshot = {} as TContext;
      for (const key of Object.keys(options.context)) {
        (contextSnapshot as Record<string, unknown>)[key] = (
          context as Record<string, { value: unknown }>
        )[key].value;
      }

      return {
        value: state.value,
        context: contextSnapshot,
        done: done.value,
        event: lastEvent.value,
      };
    },

    batch(fn: () => void) {
      signalBatch(fn);
    },

    dispose() {
      // Signals are garbage collected when no references remain.
      // This is a hook for future cleanup needs (e.g., clearing timers).
      // Currently a no-op but part of the interface for forward compatibility.
    },
  };
}
