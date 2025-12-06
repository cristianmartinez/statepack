// Evaluator (JSONata-based)
export {
  compileExpression,
  evaluateCompiled,
  type CompiledJSONataExpression,
} from "./evaluate";

// Types
export type {
  EvaluatorOptions,
  Expression,
  PathExpression,
  Scope,
  Transform,
  TransformArg,
  TransformFn,
  TransformRegistry,
} from "./types";

// Utilities
export { getPath, isPathReference, resolveFromScope, setPath } from "./utils";

// Signal-based reactive evaluation
export {
  // Types
  type SignalLike,
  type WritableSignal,
  type SignalContext,
  type SignalScope,
  type ReactiveBinding,
  type CreateBindingOptions,
  type ContextSnapshot,
  type CreateContextStoreOptions,
  type ContextStore,
  type ComputedSelector,
  type CreateSelectorsOptions,
  type HasSignalContext,
  type SelectorsFromDefinitions,
  // Evaluation
  buildScopeFromSignals,
  evaluateWithSignals,
  trackSignals,
  // Bindings
  createBinding,
  createBindingFromCompiled,
  disposeBindings,
  // Computed async
  computedAsync,
  computedAsyncSignals,
  type ComputedAsync,
  type ComputedAsyncOptions,
  // Store
  createContextStore,
  createSelector,
  createSelectors,
  disposeSelectors,
} from "./signals";
