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

export {
  compileWithEngine, jsonataEngine, yexpEngine,
  type CompiledExpression, type CompiledYexpExpression,
  type ExpressionEngine, type ExpressionEngineId, type CompileExpressionOptions,
} from "./engine";

export { assertPortableJson, loadYexpExpression } from "./artifact";

export { ExpressionFunctionRegistry, ExpressionFunctionError, createPrimitiveRegistry, type ExpressionFunction, type JsonValue } from "./registry";
