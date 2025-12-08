import jsonata from "jsonata";

/**
 * A dependency path extracted from an expression (e.g., ["context", "foo", "bar"])
 */
export type DependencyPath = string[];

/**
 * Compiled JSONata expression that can be evaluated synchronously
 */
export interface CompiledJSONataExpression {
  expression: ReturnType<typeof jsonata>;
  source: string;
  dependencies: DependencyPath[];
}

/**
 * Extract dependency paths from a JSONata AST node
 */
function extractDependencies(node: unknown): DependencyPath[] {
  if (!node || typeof node !== "object") return [];

  const ast = node as Record<string, unknown>;
  const dependencies: DependencyPath[] = [];

  // Handle path expressions (e.g., context.foo.bar or $parent.baz)
  if (ast.type === "path" && Array.isArray(ast.steps)) {
    const path: string[] = [];
    for (const step of ast.steps) {
      const s = step as Record<string, unknown>;
      if (s.type === "name" || s.type === "variable") {
        // Prefix variables with $ to distinguish them
        const value = s.type === "variable" ? `$${s.value}` : String(s.value);
        path.push(value);
      } else {
        // Stop at filter expressions, wildcards, etc.
        break;
      }
    }
    if (path.length > 0) {
      dependencies.push(path);
    }
  }

  // Recursively process child nodes
  for (const key of Object.keys(ast)) {
    const value = ast[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        dependencies.push(...extractDependencies(item));
      }
    } else if (value && typeof value === "object") {
      dependencies.push(...extractDependencies(value));
    }
  }

  return dependencies;
}

/**
 * Compile an expression to JSONata AST (do this once at load time)
 */
export function compileExpression(expression: string): CompiledJSONataExpression {
  if (typeof expression !== "string") {
    throw new Error("JSONata only supports string expressions");
  }

  try {
    const compiled = jsonata(expression);
    const dependencies = extractDependencies(compiled.ast());

    return {
      expression: compiled,
      source: expression,
      dependencies,
    };
  } catch (err) {
    throw new Error(
      `Expression compilation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
