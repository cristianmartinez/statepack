import type {
  AndCondition,
  CompareCondition,
  CompareOp,
  Condition,
  FunctionCondition,
  LiteralValue,
  NotCondition,
  OrCondition,
  RefValue,
  Value,
} from "../types";

/**
 * Compiled condition with source and AST
 */
export interface CompiledCondition {
  source: string;
  ast: Condition;
}

/**
 * AST builder helpers for conditions
 */
export const AST = {
  /**
   * Create a literal value
   */
  literal: (value: string | number | boolean | null): LiteralValue => ({
    type: "literal",
    value,
  }),

  /**
   * Create a path reference
   */
  ref: (path: string, optional = false): RefValue => ({
    type: "ref",
    path,
    ...(optional && { optional }),
  }),

  /**
   * Create a comparison condition
   */
  compare: (op: CompareOp, left: Value, right: Value): CompareCondition => ({
    type: "compare",
    op,
    left,
    right,
  }),

  /**
   * Create an AND condition
   */
  and: (conditions: Condition[]): AndCondition => ({
    type: "and",
    conditions,
  }),

  /**
   * Create an OR condition
   */
  or: (conditions: Condition[]): OrCondition => ({
    type: "or",
    conditions,
  }),

  /**
   * Create a NOT condition
   */
  not: (condition: Condition): NotCondition => ({
    type: "not",
    condition,
  }),

  /**
   * Create a function condition
   */
  fn: (name: string, args: Value[]): FunctionCondition => ({
    type: "fn",
    name,
    args,
  }),

  /**
   * Create a compiled condition
   */
  compiled: (source: string, ast: Condition): CompiledCondition => ({
    source,
    ast,
  }),
};

/**
 * Type guards
 */
export function isLiteralValue(value: unknown): value is LiteralValue {
  return typeof value === "object" && value !== null && (value as LiteralValue).type === "literal";
}

export function isRefValue(value: unknown): value is RefValue {
  return typeof value === "object" && value !== null && (value as RefValue).type === "ref";
}

export function isCompareCondition(condition: unknown): condition is CompareCondition {
  return (
    typeof condition === "object" &&
    condition !== null &&
    (condition as CompareCondition).type === "compare"
  );
}

export function isAndCondition(condition: unknown): condition is AndCondition {
  return (
    typeof condition === "object" &&
    condition !== null &&
    (condition as AndCondition).type === "and"
  );
}

export function isOrCondition(condition: unknown): condition is OrCondition {
  return (
    typeof condition === "object" && condition !== null && (condition as OrCondition).type === "or"
  );
}

export function isNotCondition(condition: unknown): condition is NotCondition {
  return (
    typeof condition === "object" && condition !== null && (condition as NotCondition).type === "not"
  );
}

export function isFunctionCondition(condition: unknown): condition is FunctionCondition {
  return (
    typeof condition === "object" && condition !== null && (condition as FunctionCondition).type === "fn"
  );
}
