import { describe, expect, test } from "bun:test";
import { compileExpression } from "./compile";

describe("compileExpression", () => {
  test("compiles a simple path expression", () => {
    const compiled = compileExpression("name");
    expect(compiled.source).toBe("name");
    expect(compiled.expression).toBeDefined();
  });

  test("throws on invalid expression", () => {
    expect(() => compileExpression("{{invalid")).toThrow();
  });

  test("extracts dependencies from simple path", () => {
    const compiled = compileExpression("context.foo");
    expect(compiled.dependencies).toEqual([["context", "foo"]]);
  });

  test("extracts dependencies from nested path", () => {
    const compiled = compileExpression("context.user.profile.name");
    expect(compiled.dependencies).toEqual([["context", "user", "profile", "name"]]);
  });

  test("extracts multiple dependencies", () => {
    const compiled = compileExpression("context.foo + context.bar.baz");
    expect(compiled.dependencies).toEqual([
      ["context", "foo"],
      ["context", "bar", "baz"],
    ]);
  });

  test("extracts dependencies from variable references", () => {
    const compiled = compileExpression("$parent.value");
    expect(compiled.dependencies).toEqual([["$parent", "value"]]);
  });

  test("extracts mixed dependencies", () => {
    const compiled = compileExpression('context.name & " - " & $root.title');
    expect(compiled.dependencies).toEqual([
      ["context", "name"],
      ["$root", "title"],
    ]);
  });

  test("stops at filter expressions", () => {
    const compiled = compileExpression("context.items[0].name");
    expect(compiled.dependencies).toEqual([["context", "items", "name"]]);
  });

  test("handles expressions with no dependencies", () => {
    const compiled = compileExpression('"hello"');
    expect(compiled.dependencies).toEqual([]);
  });

  test("extracts dependencies from function arguments", () => {
    const compiled = compileExpression("$uppercase(context.name)");
    expect(compiled.dependencies).toEqual([["context", "name"]]);
  });

  test("extracts dependencies from nested function arguments", () => {
    const compiled = compileExpression("$sum(context.items.price)");
    expect(compiled.dependencies).toEqual([["context", "items", "price"]]);
  });

  test("handles functions with no arguments", () => {
    const compiled = compileExpression("$now()");
    expect(compiled.dependencies).toEqual([]);
  });

  test("extracts dependencies from function combined with path", () => {
    const compiled = compileExpression("$string(context.count) & context.label");
    expect(compiled.dependencies).toEqual([
      ["context", "count"],
      ["context", "label"],
    ]);
  });

  test("extracts dependencies from multiple functions", () => {
    const compiled = compileExpression(
      "$uppercase(context.first) & $lowercase(context.last)"
    );
    expect(compiled.dependencies).toEqual([
      ["context", "first"],
      ["context", "last"],
    ]);
  });

  test("extracts dependencies from comparison expressions", () => {
    const compiled = compileExpression("context.age > 18");
    expect(compiled.dependencies).toEqual([["context", "age"]]);
  });

  test("extracts dependencies from equality comparison", () => {
    const compiled = compileExpression("context.status = context.expected");
    expect(compiled.dependencies).toEqual([
      ["context", "status"],
      ["context", "expected"],
    ]);
  });

  test("extracts dependencies from variable binding (rhs only)", () => {
    const compiled = compileExpression("($x := context.value; $x + 1)");
    expect(compiled.dependencies).toEqual([["context", "value"]]);
  });

  test("extracts dependencies from block with multiple bindings", () => {
    const compiled = compileExpression(
      "($a := context.first; $b := context.second; $a + $b)"
    );
    expect(compiled.dependencies).toEqual([
      ["context", "first"],
      ["context", "second"],
    ]);
  });

  test("caches compiled expressions", () => {
    const expr = "context.cached.value";
    const first = compileExpression(expr);
    const second = compileExpression(expr);
    expect(first).toBe(second);
  });

  test("caches different expressions separately", () => {
    const first = compileExpression("context.a");
    const second = compileExpression("context.b");
    expect(first).not.toBe(second);
  });
});
