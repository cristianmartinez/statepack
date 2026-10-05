import {
  compileWithEngine as compileEngineExpression,
  type CompileExpressionOptions,
  type CompiledExpression as EngineCompiledExpression,
} from "@statepack/expressions";
import type { StoreDefinition, SliceDefinition } from "../schema";

// Re-export signal runtime
export * from "./signal-runtime";

/**
 * Compiled expression entry
 */
export interface CompiledExpression {
  source: string;
  compiled: EngineCompiledExpression;
}

/**
 * Compiled slice - runtime-ready version of SliceDefinition
 */
export interface CompiledSlice {
  /** Original slice definition */
  definition: SliceDefinition;
  /** Pre-compiled expressions */
  expressions: Map<string, CompiledExpression>;
}

/**
 * Compiled store - runtime-ready version of StoreDefinition
 */
export interface CompiledStore {
  /** Compiled slices by name */
  slices: Map<string, CompiledSlice>;
  /** Version */
  version: string;
  /** Compilation timestamp */
  compiledAt: number;
}

/**
 * Compile a store definition into a runtime-ready form
 */
export function compileStore(store: StoreDefinition, options: CompileExpressionOptions = {}): CompiledStore {
  const slices = new Map<string, CompiledSlice>();

  for (const [name, slice] of Object.entries(store)) {
    slices.set(name, compileSlice(slice, options));
  }

  return {
    slices,
    version: "1.0.0",
    compiledAt: Date.now(),
  };
}

/**
 * Compile a single slice definition
 */
function compileSlice(slice: SliceDefinition, options: CompileExpressionOptions): CompiledSlice {
  const expressions = new Map<string, CompiledExpression>();

  // Compile queries
  if (slice.queries) {
    for (const queryExpr of Object.values(slice.queries)) {
      compileValue(queryExpr, expressions, options);
    }
  }

  // Compile mutations
  if (slice.mutations) {
    for (const mutation of Object.values(slice.mutations)) {
      for (const expr of Object.values(mutation)) {
        compileValue(expr, expressions, options);
      }
    }
  }

  // Compile sources (dynamic headers)
  if (slice.sources) {
    for (const source of Object.values(slice.sources)) {
      if (source.headers) {
        for (const headerValue of Object.values(source.headers)) {
          compileValue(headerValue, expressions, options);
        }
      }
    }
  }

  return { definition: slice, expressions };
}

/**
 * Compile a value (string expression, array, or object)
 */
function compileValue(value: unknown, expressions: Map<string, CompiledExpression>, options: CompileExpressionOptions): void {
  if (typeof value === "string") {
    if (!expressions.has(value)) {
      try {
        const compiledExpr = compileEngineExpression(value, options);
        expressions.set(value, { source: value, compiled: compiledExpr });
      } catch (error) {
        if (options.engine === "yexp") throw error;
        // Not a valid expression, skip
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      compileValue(item, expressions, options);
    }
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      compileValue(v, expressions, options);
    }
  }
}
