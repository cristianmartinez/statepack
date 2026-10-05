import { z } from "zod";
import { assertPortableJson, loadYexpExpression, type CompiledYexpExpression, type CompiledExpression } from "@statepack/expressions";
import type { CompiledStore } from "@statepack/data";
import { MachineSchema, type Machine, type Actions, type StateNode, type Transitions } from "../schema/types";
import { assertMachine } from "../schema/validate";
import { compileMachine } from "./index";
import type { CompiledMachine } from "./types";

export type PortableExpressionEntry = [key: string, expression: CompiledYexpExpression];

/** Experimental compiled-program format. It does not represent a running instance. */
export interface PortableMachineArtifact {
  format: "statepack.compiled";
  version: 1;
  definition: Machine;
  expressions: PortableExpressionEntry[];
  slices: Array<{ name: string; expressions: PortableExpressionEntry[] }>;
}

const EntrySchema = z.tuple([z.string(), z.unknown()]);
const ArtifactSchema = z.object({
  format: z.literal("statepack.compiled"),
  version: z.literal(1),
  definition: MachineSchema,
  expressions: z.array(EntrySchema),
  slices: z.array(z.object({ name: z.string(), expressions: z.array(EntrySchema) }).strict()),
}).strict();

function exportExpressions(entries: Map<string, { compiled: CompiledExpression }>, ids: Map<string, string>): PortableExpressionEntry[] {
  return Array.from(entries, ([key, { compiled }]) => {
    if (!("engine" in compiled) || compiled.engine !== "yexp") {
      throw new Error("Portable machine artifacts require Yexp expressions");
    }
    // Deploy bytecode without authoring source.
    const expression = loadYexpExpression({
      engine: compiled.engine, artifactVersion: compiled.artifactVersion, program: compiled.program,
    });
    return [ids.get(key)!, expression];
  });
}


/** Replace only expression-bearing fields; state/event names and initial data remain literals. */
function rewriteDefinition(definition: Machine, ids: Map<string, string>, sliceIds: Map<string, Map<string, string>>): void {
  function rewrite(value: unknown, table: Map<string, string>): unknown {
    if (typeof value === "string") return table.get(value) ?? value;
    if (Array.isArray(value)) return value.map(item => rewrite(item, table));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item, table)]));
    }
    return value;
  }
  function actions(value: Actions): void {
    for (const action of Array.isArray(value) ? value : [value]) {
      if (typeof action === "string") continue; // Named action reference.
      const object = action as Record<string, unknown>;
      if (action.type === "mutation") {
        continue; // Mutation identifiers and payloads are consumed as literals.
      } else if (action.type === "conditional") {
        actions(action.then as Actions);
        if (action.else) actions(action.else as Actions);
      } else if (action.type === "assign") {
        object.values = rewrite(action.values, ids);
      } else {
        for (const [key, item] of Object.entries(object)) {
          if (key !== "type" && key !== "condition") object[key] = rewrite(item, ids);
        }
      }
    }
  }
  function transitions(value: Transitions): void {
    for (const transition of Array.isArray(value) ? value : [value]) {
      if (typeof transition !== "string" && transition.actions) actions(transition.actions);
    }
  }
  function state(node: StateNode): void {
    if (node.entry) actions(node.entry);
    if (node.exit) actions(node.exit);
    Object.values(node.on ?? {}).forEach(transitions);
    Object.values(node.after ?? {}).forEach(transitions);
    node.always?.forEach(transitions);
    Object.values(node.states ?? {}).forEach(state);
  }
  Object.values(definition.actions ?? {}).forEach(actions);
  Object.values(definition.on ?? {}).forEach(transitions);
  Object.values(definition.states).forEach(state);
  for (const [name, slice] of Object.entries(definition.store ?? {})) {
    const table = sliceIds.get(name)!;
    if (slice.queries) slice.queries = rewrite(slice.queries, table) as typeof slice.queries;
    if (slice.mutations) slice.mutations = rewrite(slice.mutations, table) as typeof slice.mutations;
    for (const source of Object.values(slice.sources ?? {})) {
      if (source.headers) source.headers = rewrite(source.headers, table) as typeof source.headers;
    }
  }
}

/** Convert runtime caches into plain JSON tables; reject runtime-only engines. */
export function serializeMachine(compiled: CompiledMachine): PortableMachineArtifact {
  if (compiled.source.expressionEngine !== "yexp" || compiled.compiled.engine !== "yexp") {
    throw new Error('Portable machine artifacts require expressionEngine: "yexp"');
  }
  assertPortableJson(compiled.source);
  assertMachine(compiled.source);
  const definition = JSON.parse(JSON.stringify(compiled.source)) as Machine;
  const reserved = new Set<string>();
  function collect(value: unknown): void {
    if (typeof value === "string") reserved.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(definition);
  let nextId = 0;
  function allocate(entries: Map<string, unknown>): Map<string, string> {
    return new Map(Array.from(entries.keys(), key => {
      let id: string;
      do { id = `expr:${nextId++}`; } while (reserved.has(id));
      reserved.add(id);
      return [key, id];
    }));
  }
  const ids = allocate(compiled.compiled.expressions);
  const sliceIds = new Map(Array.from(compiled.store?.slices ?? [], ([name, slice]) => [name, allocate(slice.expressions)]));
  rewriteDefinition(definition, ids, sliceIds);
  const artifact: PortableMachineArtifact = {
    format: "statepack.compiled", version: 1, definition,
    expressions: exportExpressions(compiled.compiled.expressions, ids),
    slices: compiled.store ? Array.from(compiled.store.slices, ([name, slice]) => ({
      name, expressions: exportExpressions(slice.expressions, sliceIds.get(name)!),
    })) : [],
  };
  // Validate cross-table consistency and give callers an independent, plain object.
  loadMachineArtifact(artifact);
  return JSON.parse(JSON.stringify(artifact)) as PortableMachineArtifact;
}

/** Compile an authoring definition directly into the portable deployment format. */
export function compileMachineArtifact(machine: Machine): PortableMachineArtifact {
  assertPortableJson(machine);
  assertMachine(machine);
  if (machine.expressionEngine !== "yexp") {
    throw new Error('Portable machine artifacts require expressionEngine: "yexp"');
  }
  return serializeMachine(compileMachine(machine));
}

function loadExpressions(entries: Array<[string, unknown]>): CompiledMachine["compiled"]["expressions"] {
  const expressions: CompiledMachine["compiled"]["expressions"] = new Map();
  for (const [key, value] of entries) {
    if (expressions.has(key)) throw new Error(`Duplicate expression key: ${key}`);
    expressions.set(key, { source: key, compiled: loadYexpExpression(value) });
  }
  return expressions;
}

/** Rehydrate caches without parsing or compiling expression source. */
export function loadMachineArtifact(value: unknown): CompiledMachine {
  assertPortableJson(value);
  const artifact = ArtifactSchema.parse(value);
  assertMachine(artifact.definition);
  if (artifact.definition.expressionEngine !== "yexp") throw new Error("Unsupported artifact expression engine");
  const expressions = loadExpressions(artifact.expressions);
  const slices: CompiledStore["slices"] = new Map();
  const definitions = artifact.definition.store ?? {};
  for (const slice of artifact.slices) {
    if (slices.has(slice.name)) throw new Error(`Duplicate slice: ${slice.name}`);
    if (!Object.hasOwn(definitions, slice.name)) throw new Error(`Unknown slice: ${slice.name}`);
    const definition = definitions[slice.name]!;
    const compiledExpressions = loadExpressions(slice.expressions);
    const required = [
      ...Object.values(definition.queries ?? {}),
      ...Object.values(definition.mutations ?? {}).flatMap(mutation => Object.values(mutation)),
      ...Object.values(definition.sources ?? {}).flatMap(source => Object.values(source.headers ?? {})),
    ];
    for (const key of required) {
      if (!compiledExpressions.has(key)) throw new Error(`Missing expression in slice ${slice.name}: ${key}`);
    }
    slices.set(slice.name, { definition, expressions: compiledExpressions });
  }
  for (const name of Object.keys(definitions)) {
    if (!slices.has(name)) throw new Error(`Missing compiled slice: ${name}`);
  }
  return {
    source: artifact.definition,
    compiled: { engine: "yexp", guards: new Map(), expressions },
    store: artifact.definition.store ? { slices, version: "1.0.0", compiledAt: 0 } : undefined,
    version: "1.0.0", compiledAt: 0,
  };
}
