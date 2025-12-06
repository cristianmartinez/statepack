// Types
export type {
  SignalLike,
  WritableSignal,
  SignalContext,
  SignalScope,
  ReactiveBinding,
  CreateBindingOptions,
  ContextSnapshot,
  CreateContextStoreOptions,
  ContextStore,
} from "./types";

// Signal-aware evaluation
export { buildScopeFromSignals, evaluateWithSignals, trackSignals } from "./evaluate";

// Reactive bindings
export { createBinding, createBindingFromCompiled, disposeBindings } from "./binding";

// Computed async
export {
  computedAsync,
  computedAsyncSignals,
  type ComputedAsync,
  type ComputedAsyncOptions,
} from "./computed-async";

// Store (context store + selectors)
export {
  createContextStore,
  createSelector,
  createSelectors,
  disposeSelectors,
  type ComputedSelector,
  type CreateSelectorsOptions,
  type HasSignalContext,
  type SelectorsFromDefinitions,
} from "./store";
