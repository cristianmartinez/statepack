import { compile as compileYexp, evaluate as evaluateYexp, isExprError, isLambdaValue, type BytecodeProgram, type ExprValue } from "@cristianmartinez/yexp";
import { compileExpression, type CompiledJSONataExpression } from "./compile";
import { evaluateJSONataCompiled } from "./jsonata";
import type { EvaluatorOptions, Scope } from "./types";

export type ExpressionEngineId = "jsonata" | "yexp";
export interface CompileExpressionOptions { engine?: ExpressionEngineId }
export interface CompiledYexpExpression {
  engine: "yexp";
  artifactVersion: 1;
  program: BytecodeProgram;
  source?: string;
}
export type CompiledExpression = CompiledJSONataExpression | CompiledYexpExpression;

export interface ExpressionEngine<Program> {
  readonly id: ExpressionEngineId;
  compile(source: string): Program;
  evaluate(program: Program, scope: Scope, options?: EvaluatorOptions): Promise<unknown>;
}

/** Existing definitions retain JSONata semantics until explicitly migrated. */
export const jsonataEngine: ExpressionEngine<CompiledJSONataExpression> = {
  id: "jsonata",
  compile: compileExpression,
  evaluate: evaluateJSONataCompiled,
};

/** Reject values whose meaning would change during JSON serialization. */
function assertJson(value: unknown): asserts value is ExprValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) assertJson(item); return; }
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value)) assertJson(item);
    return;
  }
  throw new Error("Yexp requires finite JSON values");
}

export const yexpEngine: ExpressionEngine<CompiledYexpExpression> = {
  id: "yexp",
  compile(source) {
    const program = compileYexp(source);
    assertJson(program);
    return { engine: "yexp", artifactVersion: 1, source, program };
  },
  async evaluate(compiled, scope, options) {
    if (compiled.engine !== "yexp" || compiled.artifactVersion !== 1 || compiled.program.version !== 1) {
      throw new Error("Unsupported Yexp artifact or bytecode version");
    }
    // Pending reactive queries use undefined; Yexp represents missing values as null.
    const normalizedScope = JSON.parse(JSON.stringify(scope, (_key, value) => {
      if (value === undefined) return null;
      if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" ||
          (typeof value === "number" && !Number.isFinite(value))) {
        throw new Error("Yexp requires finite JSON values");
      }
      return value;
    }));
    assertJson(normalizedScope);
    // Explicit legacy context avoids Yexp's input-overload heuristic for state/data.
    // Clone because Yexp includes mutation operations: expressions cannot mutate host data.
    const root = normalizedScope as ExprValue;
    const result = evaluateYexp(compiled.program, { root, state: null }, { functions: options?.functions?.toYexpFunctions() });
    if (isExprError(result)) throw new Error(`Yexp ${result.error}: ${result.message}`);
    if (isLambdaValue(result)) throw new Error("Yexp expressions must return JSON values");
    assertJson(result);
    return result;
  },
};

export function compileWithEngine(source: string, options: CompileExpressionOptions = {}): CompiledExpression {
  switch (options.engine ?? "jsonata") {
    case "jsonata": return jsonataEngine.compile(source);
    case "yexp": return yexpEngine.compile(source);
    default: throw new Error(`Unsupported expression engine: ${options.engine}`);
  }
}
