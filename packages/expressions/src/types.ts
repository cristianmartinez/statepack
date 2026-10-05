import type { ExpressionFunctionRegistry } from "./registry";
/**
 * Expression Engine Types
 */

// Transform argument can be a literal or a path reference
export type TransformArg = string | number | boolean | null | PathExpression;

// A transform operation
export interface Transform {
  name: string;
  args?: TransformArg[];
}

// A path expression with optional transforms
export interface PathExpression {
  path: string;
  transforms?: Transform[];
}

// Can be a simple string path or a full expression object
export type Expression = string | PathExpression;

// Scope for evaluation
export interface Scope {
  context?: Record<string, unknown>;
  params?: Record<string, unknown>;
  loaderData?: Record<string, unknown>;
  event?: Record<string, unknown>;
  item?: unknown;
  index?: number;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

// Transform function signature
export type TransformFn = (value: unknown, args: unknown[], scope: Scope) => unknown;

// Registry of transform functions
export type TransformRegistry = Record<string, TransformFn>;

// Options for the evaluator
export interface EvaluatorOptions {
  functions?: ExpressionFunctionRegistry;
  transforms?: TransformRegistry;
  locale?: string;
}
