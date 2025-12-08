import { describe, expect, test } from "bun:test";
import { compileExpression } from "./compile";
import { evaluateCompiled } from "./evaluate";

describe("evaluateCompiled", () => {
  test("evaluates a simple path", async () => {
    const compiled = compileExpression("name");
    const result = await evaluateCompiled(compiled, { name: "Alice" });
    expect(result).toBe("Alice");
  });

  test("evaluates nested path", async () => {
    const compiled = compileExpression("user.name");
    const result = await evaluateCompiled(compiled, { user: { name: "Bob" } });
    expect(result).toBe("Bob");
  });

  test("evaluates JSONata function", async () => {
    const compiled = compileExpression("$uppercase(name)");
    const result = await evaluateCompiled(compiled, { name: "alice" });
    expect(result).toBe("ALICE");
  });

  test("evaluates arithmetic", async () => {
    const compiled = compileExpression("a + b");
    const result = await evaluateCompiled(compiled, { a: 1, b: 2 });
    expect(result).toBe(3);
  });

  test("returns undefined for missing path", async () => {
    const compiled = compileExpression("missing");
    const result = await evaluateCompiled(compiled, {});
    expect(result).toBeUndefined();
  });
});
