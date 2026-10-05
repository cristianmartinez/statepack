import { validateMachineProfile } from "./profile";
import { loadMachineArtifact, interpretWithSignals } from "../../packages/state-machine/src/index";
import { createPrimitiveRegistry, evaluateCompiled, loadYexpExpression, ExpressionFunctionError } from "../../packages/expressions/dist/index";
import profile from "../profile.json";

export function validateExpression(expression: any, registry: ReturnType<typeof createPrimitiveRegistry>): void {
  loadYexpExpression(expression);
  if (JSON.stringify(expression.program.constants).includes('"__lambda":true')) {
    throw new ExpressionFunctionError("UNSUPPORTED_FEATURE", "Lambdas are outside the native profile");
  }
  for (const instruction of expression.program.code) {
    if (!profile.supportedOpcodes.includes(instruction[0])) throw new ExpressionFunctionError("UNSUPPORTED_FEATURE", `Unsupported opcode: ${instruction[0]}`);
    if (instruction[0] === 130 && !registry.has(instruction[1])) throw new ExpressionFunctionError("UNKNOWN_FUNCTION", `Unknown function: ${instruction[1]}`);
  }
}

function scalarStrings(value: any): void {
  if (typeof value === "string") {
    for (let i=0;i<value.length;i++) {
      const unit=value.charCodeAt(i);
      if (unit>=0xD800 && unit<=0xDBFF) {
        const next=value.charCodeAt(++i);
        if (!(next>=0xDC00 && next<=0xDFFF)) throw new ExpressionFunctionError("UNSUPPORTED_FEATURE","Surrogate string output");
      } else if(unit>=0xDC00 && unit<=0xDFFF) throw new ExpressionFunctionError("UNSUPPORTED_FEATURE","Surrogate string output");
    }
  } else if(Array.isArray(value)) value.forEach(scalarStrings);
  else if(value && typeof value === "object") { Object.keys(value).forEach(scalarStrings); Object.values(value).forEach(scalarStrings); }
}

export async function executeRequest(request: any): Promise<any> {
  try {
    if (request.mode === "capabilities") return { profile: profile.id, ...profile };
    const registry = createPrimitiveRegistry();
    for (const [name, implementation] of Object.entries(request.registry ?? {})) {
      if (implementation !== "double") throw new ExpressionFunctionError("INVALID_ARTIFACT", "Unknown registry diagnostic implementation");
      registry.register(name, ([value]) => {
        if (typeof value !== "number") throw new ExpressionFunctionError("TYPE_ERROR", "double requires a number");
        return value * 2;
      });
    }
    if (request.mode === "expression") {
      validateExpression(request.expression, registry);
      const value = await evaluateCompiled(loadYexpExpression(request.expression), request.scope ?? {}, { functions: registry });
      scalarStrings(value);
      return { value };
    }
    if (request.mode !== "machine") throw new ExpressionFunctionError("INVALID_ARTIFACT", "Unknown request mode");
    for (const [, expression] of request.artifact.expressions ?? []) validateExpression(expression, registry);
    for (const slice of request.artifact.slices ?? []) {
      for (const [, expression] of slice.expressions) validateExpression(expression, registry);
    }
    const compiled = loadMachineArtifact(request.artifact);
    validateMachineProfile(compiled, registry);
    const effects: unknown[] = [];
    const runtime = interpretWithSignals(compiled, { expressionFunctions: registry, execute: async effect => { effects.push(effect); } });
    try {
      await runtime.start();
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const event of request.events ?? []) {
        await runtime.send(event);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const store: Record<string, unknown> = {};
      const queries: Record<string, unknown> = {};
      for (const [name, slice] of compiled.store?.slices ?? []) {
        const scope = runtime.getSignalScope(name);
        const context = { ...runtime.getSliceContext(name) };
        const values = Object.fromEntries(Object.entries(scope?.queries ?? {}).map(([key, signal]) => [key, signal.value]));
        // Query names are derived output, never persistent data in this profile.
        for (const key of Object.keys(slice.definition.queries ?? {})) delete context[key];
        store[name] = context;
        queries[name] = values;
      }
      return { state: runtime.state.value, done: runtime.done.value, store, queries, effects };
    } finally { runtime.stop(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof ExpressionFunctionError ? error.code :
      message.match(/Yexp (\w+):/)?.[1] ?? (/Invalid Yexp (instruction|opcode|table|jump|index|call|range|property|collection)/.test(message) ? "INVALID_INSTRUCTION" : undefined) ?? (message.includes("JSON values") ? "TYPE_ERROR" : "INVALID_ARTIFACT");
    return { error: { code, message } };
  }
}
