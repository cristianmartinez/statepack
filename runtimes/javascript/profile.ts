import { ExpressionFunctionError, type ExpressionFunctionRegistry } from "../../packages/expressions/dist/index";
import type { CompiledMachine } from "../../packages/state-machine/src/index";

const fail = (message: string): never => { throw new ExpressionFunctionError("UNSUPPORTED_FEATURE", message); };
const invalid = (message: string): never => { throw new ExpressionFunctionError("INVALID_ARTIFACT", message); };
function fields(object: any, allowed: string[]) {
  if (!object || typeof object !== "object" || Array.isArray(object)) invalid("Expected object");
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`Unsupported field: ${key}`);
}

/** Validate the same bounded machine language before any effects run. */
export function validateMachineProfile(compiled: CompiledMachine, registry: ExpressionFunctionRegistry): void {
  const machine: any = compiled.source;
  fields(machine,["id","expressionEngine","initial","store","states","on","guards","actions"]);
  const actionStack = new Set<string>();
  function action(value: any): void {
    if (Array.isArray(value)) { value.forEach(action); return; }
    if (typeof value === "string") {
      if (actionStack.has(value)) throw new ExpressionFunctionError("LIMIT_EXCEEDED","Named action cycle");
      if (!Object.hasOwn(machine.actions ?? {},value)) invalid(`Missing named action: ${value}`);
      actionStack.add(value); action(machine.actions[value]); actionStack.delete(value); return;
    }
    if (!["mutation","log","host.event"].includes(value?.type)) fail(`Unsupported action: ${value?.type}`);
    if (value.condition !== undefined) fail("Action conditions are outside native profile");
    fields(value,value.type === "mutation" ? ["type","name","payload"] : value.type === "log" ? ["type","message","level"] : ["type","name","data"]);
    if (value.type === "mutation") {
      const names = Object.keys(machine.store ?? {});
      const split = value.name.split(".");
      const slice = split.length === 2 ? split[0] : names.length === 1 ? names[0] : invalid("Mutation requires slice prefix");
      const name = split.length === 2 ? split[1] : value.name;
      if (!Object.hasOwn(machine.store[slice]?.mutations ?? {},name)) invalid("Unknown mutation");
    }
  }
  function condition(value: any): void {
    if (typeof value === "boolean" || typeof value === "string") return;
    if (["truthy","literal"].includes(value?.type)) return;
    if (value?.type === "compare") {
      for (const operand of [value.left,value.right]) {
        if (operand && typeof operand === "object" && !["ref","literal"].includes(operand.type)) fail("Unsupported condition operand");
      }
      return;
    }
    if (["and","or"].includes(value?.type)) { value.conditions.forEach(condition); return; }
    if (value?.type === "not") { condition(value.condition); return; }
    fail(`Unsupported condition: ${value?.type}`);
  }
  function guard(value: any): void {
    if (value === undefined) return;
    if (typeof value === "string") {
      if (!Object.hasOwn(machine.guards ?? {},value)) invalid("Unknown guard");
      condition(machine.guards[value].condition); return;
    }
    if (value.condition !== undefined) { condition(value.condition); return; }
    if (value.and) { value.and.forEach(guard); return; }
    if (value.or) { value.or.forEach(guard); return; }
    if (value.not !== undefined) { guard(value.not); return; }
    fail("Unsupported guard");
  }
  function transition(value: any): void {
    if (Array.isArray(value)) { value.forEach(transition); return; }
    if (typeof value === "string") { if (!Object.hasOwn(machine.states,value)) invalid("Unknown target"); return; }
    fields(value,["target","actions","guard","internal"]);
    if (value.target !== undefined && !Object.hasOwn(machine.states,value.target)) invalid("Unknown target");
    guard(value.guard); if (value.actions !== undefined) action(value.actions);
  }
  Object.values(machine.actions ?? {}).forEach(action);
  Object.values(machine.guards ?? {}).forEach((value:any)=>condition(value.condition));
  Object.values(machine.on ?? {}).forEach(transition);
  for (const state of Object.values(machine.states) as any[]) {
    fields(state,["id","type","entry","exit","on","always","meta"]);
    if (state.type !== undefined && !["atomic","final"].includes(state.type)) fail("Unsupported state type");
    if (state.entry) action(state.entry); if (state.exit) action(state.exit);
    Object.values(state.on ?? {}).forEach(transition); state.always?.forEach(transition);
  }
  for (const [,slice] of compiled.store?.slices ?? []) {
    if (slice.definition.sources !== undefined) fail("Sources are outside native profile");
    const names = Object.keys(slice.definition.queries ?? {});
    const visiting = new Set<string>(); const visited = new Set<string>();
    function query(name: string) {
      if (visiting.has(name)) invalid("Query dependency cycle");
      if (visited.has(name)) return;
      visiting.add(name);
      const expression = slice.expressions.get(slice.definition.queries![name]!)!.compiled;
      if ("engine" in expression) {
        for (const slot of expression.program.slots) for (const dependency of names) {
          if ([`$.context.${dependency}`,`$.queries.${dependency}`].some(prefix => slot === prefix || slot.startsWith(prefix+".") || slot.startsWith(prefix+"["))) query(dependency);
        }
      }
      visiting.delete(name); visited.add(name);
    }
    names.forEach(query);
  }
}
