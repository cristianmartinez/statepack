// Types
export type {
  Condition,
  Scope,
  EvaluatorOptions,
  Value,
  RefValue,
  LiteralValue,
  CompareOp,
  TruthyCondition,
  LiteralCondition,
  CompareCondition,
  AndCondition,
  OrCondition,
  NotCondition,
  IsDefinedCondition,
  IsNullCondition,
  IsEmptyCondition,
  IsNotEmptyCondition,
  FunctionCondition,
  MatchCondition,
  StateCondition,
  NamedCondition,
} from "./types.ts";

// Evaluator
export { evaluate, createEvaluator } from "./evaluate.ts";

// Utilities
export { getPath, resolveValue, isEmpty, isPathLike } from "./utils.ts";

// Functions
export { builtinFunctions } from "./functions.ts";
export type { BuiltinFunction } from "./functions.ts";
