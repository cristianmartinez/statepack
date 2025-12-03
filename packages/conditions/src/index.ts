// Types

// Evaluator
export { createEvaluator, evaluate } from "./evaluate";
export type { BuiltinFunction } from "./functions";
// Functions
export { builtinFunctions } from "./functions";
// Parser (string expression to Condition)
export { parseExpression } from "./parse";

// Compiler alias for consistency with other packages
export { parseExpression as compile } from "./parse";
export type {
  AndCondition,
  CompareCondition,
  CompareOp,
  Condition,
  EvaluatorOptions,
  FunctionCondition,
  IsDefinedCondition,
  IsEmptyCondition,
  IsNotEmptyCondition,
  IsNullCondition,
  LiteralCondition,
  LiteralValue,
  MatchCondition,
  NamedCondition,
  NotCondition,
  OrCondition,
  RefValue,
  Scope,
  StateCondition,
  StateValue,
  TruthyCondition,
  Value,
} from "./types";
// Utilities
export { getPath, isEmpty, isPathLike, resolveValue } from "./utils";
