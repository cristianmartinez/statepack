import { describe, expect, test } from "bun:test";
import { compileWithEngine, yexpEngine } from "./engine";
import { evaluateCompiled } from "./evaluate";

describe("expression engines", () => {
  test("preserves default JSONata behavior", async () => {
    expect(await evaluateCompiled(compileWithEngine("context.count + 1"), { context: { count: 2 } })).toBe(3);
  });

  test("executes JSON-round-tripped Yexp bytecode without source", async () => {
    const artifact = JSON.parse(JSON.stringify(yexpEngine.compile("$.context.count + $.event.amount")));
    delete artifact.source;
    expect(await evaluateCompiled(artifact, { context: { count: 2 }, event: { amount: 3 }, state: { value: "active" }, data: {} })).toBe(5);
  });

  test("reports VM errors instead of returning them as data", async () => {
    await expect(evaluateCompiled(yexpEngine.compile("1 / 0"), {})).rejects.toThrow("DIVISION_BY_ZERO");
  });

  test("rejects incompatible artifact and bytecode versions", async () => {
    const artifact = yexpEngine.compile("1");
    artifact.program.version = 999;
    await expect(evaluateCompiled(artifact, {})).rejects.toThrow("Unsupported");
  });

  test("rejects input and output values that cannot survive JSON serialization", async () => {
    await expect(evaluateCompiled(yexpEngine.compile("$"), { bad: Infinity })).rejects.toThrow("JSON values");
    expect(await evaluateCompiled(yexpEngine.compile("$.pending"), { pending: undefined })).toBeNull();
    await expect(evaluateCompiled(yexpEngine.compile("x => x"), {})).rejects.toThrow("JSON values");
  });
});

import { loadYexpExpression, assertPortableJson } from "./artifact";

test("loads nested lambda bytecode and rejects incompatible nested programs", async () => {
  const artifact = yexpEngine.compile("$.items.map(item => item * 2)");
  const loaded = loadYexpExpression(JSON.parse(JSON.stringify(artifact)));
  expect(await evaluateCompiled(loaded, { items: [1, 2, 3] })).toEqual([2, 4, 6]);
  const lambda = artifact.program.constants.find(value => value && typeof value === "object" && "__lambda" in value) as { program: { version: number } };
  lambda.program.version = 999;
  expect(() => loadYexpExpression(artifact)).toThrow("bytecode version");
});

test("rejects cycles and sparse arrays before serialization", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(() => assertPortableJson(cyclic)).toThrow("cycles");
  expect(() => assertPortableJson(new Array(2))).toThrow("JSON");
});

import { createPrimitiveRegistry } from "./registry";

test("host registry overrides functions and remains outside serialized expressions", async () => {
  const functions = createPrimitiveRegistry().register("double", ([value]) => Number(value) * 2);
  const artifact = loadYexpExpression(JSON.parse(JSON.stringify(yexpEngine.compile("double($.amount)"))));
  expect(await evaluateCompiled(artifact, { amount: 3 }, { functions })).toBe(6);
  functions.register("abs", () => 42);
  expect(await evaluateCompiled(yexpEngine.compile("abs(-3)"), {}, { functions })).toBe(42);
});
