// Types
export type {
  Condition,
  Scope,
  StateValue,
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
} from "./types";

// Evaluator
export { evaluate, createEvaluator } from "./evaluate";

// Parser (string expression to Condition)
export { parseExpression } from "./parse";

// Utilities
export { getPath, resolveValue, isEmpty, isPathLike } from "./utils";

// Functions
export { builtinFunctions } from "./functions";
export type { BuiltinFunction } from "./functions";
