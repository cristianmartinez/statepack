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
 *
 * @param compiled - The compiled JSONata expression
 * @param scope - The input data (accessible as properties like `context.foo`)
 * @param options - Evaluation options (reserved for future use)
 *
 * Scope properties starting with `$` are automatically converted to JSONata bindings,
 * making them accessible as `$varname` in expressions. For example:
 * - `scope.$parent = {...}` becomes accessible as `$parent.foo` in the expression
 * - `scope.$root = {...}` becomes accessible as `$root.bar` in the expression
 */
export async function evaluateCompiled(
  compiled: CompiledJSONataExpression,
  scope: Scope,
  _options: EvaluatorOptions = {}
): Promise<unknown> {
  try {
    // Extract $-prefixed properties as JSONata bindings
    const bindings: Record<string, unknown> = {};
    const input: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(scope)) {
      if (key.startsWith("$")) {
        // Remove $ prefix for binding name (JSONata adds it back)
        bindings[key.slice(1)] = value;
      } else {
        input[key] = value;
      }
    }

    // JSONata evaluate() returns a Promise - no callback needed
    return await compiled.expression.evaluate(input, bindings);
  } catch (err) {
    throw new Error(
      `Expression evaluation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
