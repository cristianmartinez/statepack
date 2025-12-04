import jsonata from "jsonata";
import type { EvaluatorOptions, Scope } from "./types";

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
  _options: EvaluatorOptions = {}
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

