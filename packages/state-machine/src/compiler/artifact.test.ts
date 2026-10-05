import { describe, expect, test, spyOn } from "bun:test";
import { yexpEngine } from "@statepack/expressions";
import { compileMachineArtifact, loadMachineArtifact, serializeMachine } from "./artifact";
import { compileMachine } from "./index";
import { interpretWithSignals } from "../interpreter/interpreter";
import type { Machine } from "../schema/types";

const machine: Machine = {
  id: "portable-counter", expressionEngine: "yexp", initial: "active",
  store: { counter: {
    context: { count: 0, label: "expr:0" },
    queries: { doubled: "$.context.count * 2" },
    mutations: { increment: { count: "$.context.count + $.event.amount" } },
  } },
  actions: { report: { type: "log", message: "$.event.amount + 10" } },
  states: { active: { on: { INCREMENT: { actions: [
    { type: "mutation", name: "increment" }, "report",
  ] } } } },
};

describe("portable machine artifacts", () => {
  test("runs saved bytecode without expression source or compiler calls", async () => {
    const artifact = compileMachineArtifact(machine);
    const json = JSON.stringify(artifact);
    expect(json).not.toContain("$.context.count * 2");
    expect(json).not.toContain("$.context.count + $.event.amount");
    expect(artifact.definition.store?.counter?.context?.label).toBe("expr:0");
    expect(machine.store?.counter?.queries?.doubled).toBe("$.context.count * 2");
    const compile = spyOn(yexpEngine, "compile").mockImplementation(() => { throw new Error("compiler unavailable"); });
    const effects: unknown[] = [];
    const loaded = loadMachineArtifact(JSON.parse(json));
    const interpreter = interpretWithSignals(loaded, { execute: async effect => { effects.push(effect); } });
    try {
      await interpreter.start();
      await interpreter.send({ type: "INCREMENT", amount: 3 });
      expect(interpreter.getSliceContext("counter").count).toBe(3);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(interpreter.getSignalScope("counter").queries?.doubled?.value).toBe(6);
      expect(effects).toEqual([{ type: "log", params: { type: "log", message: 13 } }]);
      expect(compile).not.toHaveBeenCalled();
    } finally { interpreter.stop(); compile.mockRestore(); }
  });

  test("produces deterministic artifacts and owns loaded objects", () => {
    const artifact = compileMachineArtifact(machine);
    expect(serializeMachine(compileMachine(machine))).toEqual(artifact);
    const loaded = loadMachineArtifact(artifact);
    artifact.definition.store!.counter!.context!.count = 100;
    expect(loaded.source.store?.counter?.context?.count).toBe(0);
  });

  test("rejects runtime-only engines, unknown versions, and invalid definitions", () => {
    expect(() => compileMachineArtifact({ ...machine, expressionEngine: "jsonata" })).toThrow("require");
    const artifact = compileMachineArtifact(machine);
    expect(() => loadMachineArtifact({ ...artifact, version: 999 })).toThrow();
    expect(() => loadMachineArtifact({ ...artifact, definition: { ...artifact.definition, initial: "missing" } })).toThrow("Initial state");
  });

  test("rejects incomplete and duplicate expression/slice tables", () => {
    const artifact = compileMachineArtifact(machine);
    expect(() => loadMachineArtifact({ ...artifact, slices: [] })).toThrow("Missing compiled slice");
    expect(() => loadMachineArtifact({ ...artifact, slices: [...artifact.slices, artifact.slices[0]] })).toThrow("Duplicate slice");
    const bad = JSON.parse(JSON.stringify(artifact));
    bad.slices[0].expressions = [];
    expect(() => loadMachineArtifact(bad)).toThrow("Missing expression");
    const duplicate = JSON.parse(JSON.stringify(artifact));
    duplicate.expressions.push(duplicate.expressions[0]);
    expect(() => loadMachineArtifact(duplicate)).toThrow("Duplicate expression");
  });

  test("rejects malformed bytecode before execution", () => {
    const artifact = compileMachineArtifact(machine);
    artifact.slices[0]!.expressions[0]![1].program.code[0] = [999 as never];
    expect(() => loadMachineArtifact(artifact)).toThrow("opcode");
  });

  test("rejects values that JSON serialization would lose", () => {
    expect(() => compileMachineArtifact({ ...machine, states: { active: { meta: { bad: undefined } } } })).toThrow("JSON");
    expect(() => compileMachineArtifact({ ...machine, store: { counter: { context: { bad: Infinity } } } })).toThrow("JSON");
  });
});

test("runs the documented compiled counter fixture", async () => {
  const artifact = await Bun.file(new URL("../../../../docs/examples/compiled-counter.json", import.meta.url)).json();
  const interpreter = interpretWithSignals(loadMachineArtifact(artifact));
  try {
    await interpreter.start();
    await interpreter.send({ type: "INCREMENT", amount: 7 });
    expect(interpreter.getSliceContext("counter").count).toBe(7);
  } finally { interpreter.stop(); }
});
