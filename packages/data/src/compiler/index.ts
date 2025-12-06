import {
  compileExpression as compileJSONataExpression,
  type CompiledJSONataExpression,
} from "@ouni/expressions";
import type { Context, Mutations, Queries, Sources } from "../schema";

/**
 * Compiled expression entry
 */
export interface CompiledExpression {
  source: string;
  compiled: CompiledJSONataExpression;
}

/**
 * Data definition - the raw JSON structure
 */
export interface DataDefinition {
  /** Initial context state */
  context?: Context;
  /** Derived state (JSONata expressions over context) */
  queries?: Queries;
  /** Context modifications (mutation name → { contextKey: expression }) */
  mutations?: Mutations;
  /** API sources (for future use) */
  sources?: Sources;
}

/**
 * Compiled data with pre-compiled expressions
 */
export interface CompiledData {
  source: DataDefinition;
  compiled: {
    /** Compiled JSONata expressions by source string */
    expressions: Map<string, CompiledExpression>;
  };
  version: string;
  compiledAt: number;
}

/**
 * Type guard for CompiledData
 */
export function isCompiledData(value: unknown): value is CompiledData {
  return (
    value !== null &&
    typeof value === "object" &&
    "source" in value &&
    "compiled" in value &&
    "version" in value
  );
}

/**
 * Compile data definitions by pre-compiling all JSONata expressions
 *
 * This walks all data definitions and compiles:
 * - Query expressions (derived state from context)
 * - Mutation expressions (context key assignments)
 * - Dynamic header values in sources
 */
export function compileData(data: DataDefinition): CompiledData {
  const compiled: CompiledData["compiled"] = {
    expressions: new Map(),
  };

  // Compile queries (each query is a JSONata expression string)
  if (data.queries) {
    for (const queryExpr of Object.values(data.queries)) {
      compileValue(queryExpr, compiled);
    }
  }

  // Compile mutations (each mutation is { contextKey: expression })
  if (data.mutations) {
    for (const mutation of Object.values(data.mutations)) {
      for (const expr of Object.values(mutation)) {
        compileValue(expr, compiled);
      }
    }
  }

  // Compile sources (dynamic headers)
  if (data.sources) {
    for (const source of Object.values(data.sources)) {
      if (source.headers) {
        for (const headerValue of Object.values(source.headers)) {
          compileValue(headerValue, compiled);
        }
      }
    }
  }

  return {
    source: data,
    compiled,
    version: "1.0.0",
    compiledAt: Date.now(),
  };
}

/**
 * Compile a value (can be string expression, array, or object)
 * All strings are treated as JSONata expressions
 */
function compileValue(value: unknown, compiled: CompiledData["compiled"]): void {
  if (typeof value === "string") {
    // All strings are JSONata expressions
    if (!compiled.expressions.has(value)) {
      try {
        const compiledExpr = compileJSONataExpression(value);
        compiled.expressions.set(value, { source: value, compiled: compiledExpr });
      } catch {
        // Not a valid expression, skip compilation
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      compileValue(item, compiled);
    }
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      compileValue(v, compiled);
    }
  }
}
