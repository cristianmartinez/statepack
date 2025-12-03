// Zod Schemas (for runtime validation)
export {
  ConditionSchema,
  ValueSchema,
  CompareOpSchema,
  RefValueSchema,
  LiteralValueSchema,
  FunctionValueSchema,
  TruthyConditionSchema,
  LiteralConditionSchema,
  CompareConditionSchema,
  AndConditionSchema,
  OrConditionSchema,
  NotConditionSchema,
  IsDefinedConditionSchema,
  IsNullConditionSchema,
  IsEmptyConditionSchema,
  IsNotEmptyConditionSchema,
  MatchConditionSchema,
  StateConditionSchema,
  NamedConditionSchema,
  StateValueSchema,
  ScopeSchema,
  EvaluatorOptionsSchema,
} from "./schema";

// Evaluator
export { createEvaluator, evaluate } from "./evaluate";
export type { BuiltinFunction } from "./functions";
// Functions
export { builtinFunctions } from "./functions";

// Types (inferred from Zod schemas)
export type {
  AndCondition,
  CompareCondition,
  CompareOp,
  Condition,
  EvaluatorOptions,
  FunctionValue,
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
