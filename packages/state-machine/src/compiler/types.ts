import type { CompiledTemplate, ExpressionNode } from "@ouni/expressions";
import type { Condition } from "@ouni/conditions";
import type { Machine } from "../schema/types";

/**
 * Compiled machine with pre-parsed expression and condition ASTs
 */
export interface CompiledMachine {
  /** Original machine definition (for debugging/serialization) */
  source: Machine;

  /** Pre-compiled artifacts */
  compiled: {
    /** Map of guard condition strings → parsed Condition AST */
    guards: Map<string, { source: string; ast: Condition }>;

    /** Map of expression strings → parsed ExpressionNode AST */
    expressions: Map<string, { source: string; ast: ExpressionNode }>;

    /** Map of template strings → compiled template parts */
    templates: Map<string, { source: string; compilation: CompiledTemplate }>;
  };

  /** Compilation metadata */
  version: string;
  compiledAt: number;
}

/**
 * Compiled cache for fast lookup during interpretation
 */
export interface CompiledCache {
  guards: Map<string, { source: string; ast: Condition }>;
  expressions: Map<string, { source: string; ast: ExpressionNode }>;
  templates: Map<string, { source: string; compilation: CompiledTemplate }>;
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
