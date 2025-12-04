// Evaluator (JSONata-based)
export {
  compileExpression,
  createEvaluator,
  evaluate,
  evaluateCompiled,
  evaluateTemplate,
  registerTransforms,
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
