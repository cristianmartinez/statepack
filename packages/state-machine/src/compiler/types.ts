import type { Condition } from "@statepack/conditions";
import type { CompiledStore } from "@statepack/data";
import type { ExpressionEngineId, CompiledExpression as EngineCompiledExpression } from "@statepack/expressions";
import type { Machine } from "../schema/types";

/**
 * Compiled machine with pre-compiled JSONata expressions
 */
export interface CompiledMachine {
  /** Original machine definition (for debugging/serialization) */
  source: Machine;

  /** Pre-compiled artifacts */
  compiled: {
    /** Map of guard condition strings → parsed Condition AST */
    engine?: ExpressionEngineId;
    guards: Map<string, { source: string; ast: Condition }>;

    /** Map of expression strings → compiled JSONata expression */
    expressions: Map<string, { source: string; compiled: EngineCompiledExpression }>;
  };

  /** Compiled store (slices with context, queries, mutations) */
  store?: CompiledStore;

  /** Compilation metadata */
  version: string;
  compiledAt: number;
}

/**
 * Compiled cache for fast lookup during interpretation
 */
export interface CompiledCache {
  guards: Map<string, { source: string; ast: Condition }>;
  expressions: Map<string, { source: string; compiled: EngineCompiledExpression }>;
}

/**
 * Type guard to check if a machine is already compiled
 */
export function isCompiledMachine(machine: unknown): machine is CompiledMachine {
  return (
    typeof machine === "object" &&
    machine !== null &&
    "source" in machine &&
    "compiled" in machine &&
    "version" in machine
  );
}
