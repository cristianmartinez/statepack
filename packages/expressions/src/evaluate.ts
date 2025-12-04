import jsonata from "jsonata";
import type { EvaluatorOptions, Expression, Scope } from "./types";

/**
 * Compiled JSONata expression that can be evaluated synchronously
 */
export interface CompiledJSONataExpression {
  expression: ReturnType<typeof jsonata>;
  source: string;
}

/**
 * Compile an expression to JSONata AST (do this once at load time)
 */
export function compileExpression(expression: string): CompiledJSONataExpression {
  if (typeof expression !== "string") {
    throw new Error("JSONata only supports string expressions");
  }

  try {
    return {
      expression: jsonata(expression),
      source: expression,
    };
  } catch (err) {
    throw new Error(
      `Expression compilation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Evaluate a compiled expression asynchronously
 * JSONata's evaluate() returns a Promise natively - just await it!
 */
export async function evaluateCompiled(
  compiled: CompiledJSONataExpression,
  scope: Scope,
  options: EvaluatorOptions = {}
): Promise<unknown> {
  try {
    // JSONata evaluate() returns a Promise - no callback needed
    return await compiled.expression.evaluate(scope, {});
  } catch (err) {
    throw new Error(
      `Expression evaluation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Evaluate an expression (async) - DEPRECATED
 * Use compileExpression + evaluateCompiled for better performance
 *
 * @deprecated Use compileExpression() once at load time, then evaluateCompiled() for evaluation
 */
export async function evaluate(
  expression: Expression,
  scope: Scope,
  options: EvaluatorOptions = {}
): Promise<unknown> {
  if (typeof expression !== "string") {
    throw new Error("JSONata only supports string expressions");
  }

  try {
    const compiled = jsonata(expression);
    return await compiled.evaluate(scope);
  } catch (err) {
    throw new Error(
      `Expression evaluation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Evaluate a template string with bindings like "Hello, {{name}}!" (async) - DEPRECATED
 *
 * @deprecated Use compileTemplate() once at load time, then evaluateCompiledTemplate() for evaluation
 */
export async function evaluateTemplate(
  template: string,
  scope: Scope,
  options: EvaluatorOptions = {}
): Promise<string> {
  // Check if template has bindings ({{ }})
  if (!template.includes("{{")) {
    return template;
  }

  // Extract all {{expression}} patterns
  const pattern = /\{\{(.+?)\}\}/g;
  const matches = Array.from(template.matchAll(pattern));

  // Evaluate all expressions in parallel
  const values = await Promise.all(
    matches.map((match) => evaluate(match[1]!.trim(), scope, options))
  );

  // Replace placeholders with evaluated values
  let result = template;
  matches.forEach((match, i) => {
    result = result.replace(match[0], String(values[i] ?? ""));
  });

  return result;
}

/**
 * Create an evaluator with preset options
 */
export function createEvaluator(options: EvaluatorOptions = {}) {
  return {
    evaluate: (expression: Expression, scope: Scope) => evaluate(expression, scope, options),
    evaluateTemplate: (template: string, scope: Scope) =>
      evaluateTemplate(template, scope, options),
  };
}

/**
 * Register custom transforms (no-op for JSONata, kept for API compatibility)
 * @deprecated JSONata has built-in functions, custom transforms not supported
 */
export function registerTransforms(): Record<string, never> {
  console.warn("registerTransforms is deprecated with JSONata - use JSONata built-in functions");
  return {};
}
