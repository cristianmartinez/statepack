// Evaluator (JSONata-based)
export {
  compileExpression,
  evaluateCompiled,
  type CompiledJSONataExpression,
  type DependencyPath,
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
