/**
 * Condition types - now powered by Zod for runtime validation
 *
 * This file re-exports types inferred from Zod schemas for backward compatibility.
 * Use schema.ts directly if you need runtime validation.
 */

export type {
  RefValue,
  LiteralValue,
  FunctionValue,
  Value,
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
  MatchCondition,
  StateCondition,
  NamedCondition,
  Condition,
  StateValue,
  Scope,
  EvaluatorOptions,
} from "./schema";
