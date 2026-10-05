import { evaluateJSONataCompiled } from "./jsonata";
import type { EvaluatorOptions, Scope } from "./types";
export { compileExpression, type CompiledJSONataExpression, type DependencyPath } from "./compile";
import { yexpEngine, type CompiledExpression } from "./engine";

export async function evaluateCompiled(
  compiled: CompiledExpression,
  scope: Scope,
  options: EvaluatorOptions = {}
): Promise<unknown> {
  if ("engine" in compiled) return yexpEngine.evaluate(compiled, scope, options);
  return evaluateJSONataCompiled(compiled, scope, options);
}
