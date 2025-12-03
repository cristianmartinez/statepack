import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parse";
import { evaluate } from "./evaluate";

describe("parseExpression", () => {
  test("parses simple path (truthy check)", () => {
    const result = parseExpression("context.isLoggedIn");
    expect(result).toBe("context.isLoggedIn");
  });

  test("parses comparison with >", () => {
    const result = parseExpression("context.count > 0");
    expect(result).toEqual({
      type: "compare",
      op: ">",
      left: { type: "ref", path: "context.count" },
      right: { type: "literal", value: 0 },
    });
  });

  test("parses comparison with ===", () => {
    const result = parseExpression("context.status === 'active'");
    expect(result).toEqual({
      type: "compare",
      op: "===",
      left: { type: "ref", path: "context.status" },
      right: { type: "literal", value: "active" },
    });
  });

  test("parses AND expression", () => {
    const result = parseExpression("context.a && context.b");
    expect(result).toEqual({
      type: "and",
      conditions: ["context.a", "context.b"],
    });
  });

  test("parses OR expression", () => {
    const result = parseExpression("context.a || context.b");
    expect(result).toEqual({
      type: "or",
      conditions: ["context.a", "context.b"],
    });
  });

  test("parses complex expression with && and comparisons", () => {
    const result = parseExpression("context.value > 0 && context.ready");
    expect(result).toEqual({
      type: "and",
      conditions: [
        {
          type: "compare",
          op: ">",
          left: { type: "ref", path: "context.value" },
          right: { type: "literal", value: 0 },
        },
        "context.ready",
      ],
    });
  });

  test("parses boolean literals", () => {
    const result = parseExpression("context.enabled === true");
    expect(result).toEqual({
      type: "compare",
      op: "===",
      left: { type: "ref", path: "context.enabled" },
      right: { type: "literal", value: true },
    });
  });

  test("parses null", () => {
    const result = parseExpression("context.user !== null");
    expect(result).toEqual({
      type: "compare",
      op: "!==",
      left: { type: "ref", path: "context.user" },
      right: { type: "literal", value: null },
    });
  });

  test("parses numeric with decimals", () => {
    const result = parseExpression("context.price > 9.99");
    expect(result).toEqual({
      type: "compare",
      op: ">",
      left: { type: "ref", path: "context.price" },
      right: { type: "literal", value: 9.99 },
    });
  });
});

describe("parseExpression + evaluate integration", () => {
  test("evaluates simple truthy", () => {
    const condition = parseExpression("context.isLoggedIn");
    const scope = { context: { isLoggedIn: true } };
    expect(evaluate(condition, scope)).toBe(true);
  });

  test("evaluates comparison", () => {
    const condition = parseExpression("context.count > 5");
    expect(evaluate(condition, { context: { count: 10 } })).toBe(true);
    expect(evaluate(condition, { context: { count: 3 } })).toBe(false);
  });

  test("evaluates AND", () => {
    const condition = parseExpression("context.a && context.b");
    expect(evaluate(condition, { context: { a: true, b: true } })).toBe(true);
    expect(evaluate(condition, { context: { a: true, b: false } })).toBe(false);
  });

  test("evaluates OR", () => {
    const condition = parseExpression("context.a || context.b");
    expect(evaluate(condition, { context: { a: true, b: false } })).toBe(true);
    expect(evaluate(condition, { context: { a: false, b: false } })).toBe(false);
  });

  test("evaluates string comparison", () => {
    const condition = parseExpression("context.role === 'admin'");
    expect(evaluate(condition, { context: { role: "admin" } })).toBe(true);
    expect(evaluate(condition, { context: { role: "user" } })).toBe(false);
  });

  test("evaluates complex expression", () => {
    const condition = parseExpression("context.isLoggedIn && context.items.length > 0");
    const scope = { context: { isLoggedIn: true, items: [1, 2, 3] } };
    expect(evaluate(condition, scope)).toBe(true);
  });
});
