import { describe, expect, test } from "bun:test";
import { Parser } from "./parser";

describe("Parser - Basic conditions", () => {
  test("parses simple path (truthy check)", () => {
    const result = new Parser("context.isLoggedIn").compile();
    expect(result.source).toBe("context.isLoggedIn");
    expect(result.ast).toBe("context.isLoggedIn");
  });

  test("parses comparison with >", () => {
    const result = new Parser("context.count > 0").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: ">",
      left: { type: "ref", path: "context.count" },
      right: { type: "literal", value: 0 },
    });
  });

  test("parses comparison with ===", () => {
    const result = new Parser("context.status === 'active'").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: "===",
      left: { type: "ref", path: "context.status" },
      right: { type: "literal", value: "active" },
    });
  });

  test("parses comparison with boolean", () => {
    const result = new Parser("context.enabled === true").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: "===",
      left: { type: "ref", path: "context.enabled" },
      right: { type: "literal", value: true },
    });
  });

  test("parses comparison with null", () => {
    const result = new Parser("context.user !== null").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: "!==",
      left: { type: "ref", path: "context.user" },
      right: { type: "literal", value: null },
    });
  });

  test("parses comparison with decimal", () => {
    const result = new Parser("context.price > 9.99").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: ">",
      left: { type: "ref", path: "context.price" },
      right: { type: "literal", value: 9.99 },
    });
  });
});

describe("Parser - Logical operators", () => {
  test("parses AND expression", () => {
    const result = new Parser("context.a && context.b").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: ["context.a", "context.b"],
    });
  });

  test("parses OR expression", () => {
    const result = new Parser("context.a || context.b").compile();
    expect(result.ast).toEqual({
      type: "or",
      conditions: ["context.a", "context.b"],
    });
  });

  test("parses NOT expression", () => {
    const result = new Parser("!context.active").compile();
    expect(result.ast).toEqual({
      type: "not",
      condition: "context.active",
    });
  });

  test("parses complex AND with comparisons", () => {
    const result = new Parser("context.value > 0 && context.ready").compile();
    expect(result.ast).toEqual({
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
});

describe("Parser - Operator precedence", () => {
  test("AND has higher precedence than OR", () => {
    const result = new Parser("a && b || c").compile();
    expect(result.ast).toEqual({
      type: "or",
      conditions: [
        {
          type: "and",
          conditions: ["a", "b"],
        },
        "c",
      ],
    });
  });

  test("parses multiple ANDs with OR", () => {
    const result = new Parser("a && b || c && d").compile();
    expect(result.ast).toEqual({
      type: "or",
      conditions: [
        {
          type: "and",
          conditions: ["a", "b"],
        },
        {
          type: "and",
          conditions: ["c", "d"],
        },
      ],
    });
  });

  test("parses chained ORs", () => {
    const result = new Parser("a || b || c").compile();
    expect(result.ast).toEqual({
      type: "or",
      conditions: ["a", "b", "c"],
    });
  });

  test("parses chained ANDs", () => {
    const result = new Parser("a && b && c").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: ["a", "b", "c"],
    });
  });

  test("NOT has higher precedence than AND", () => {
    const result = new Parser("!a && b").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: [
        { type: "not", condition: "a" },
        "b",
      ],
    });
  });

  test("comparison has higher precedence than NOT", () => {
    const result = new Parser("a > 5").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: ">",
      left: { type: "ref", path: "a" },
      right: { type: "literal", value: 5 },
    });
  });
});

describe("Parser - Parentheses", () => {
  test("parses simple parentheses", () => {
    const result = new Parser("(a && b)").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: ["a", "b"],
    });
  });

  test("parses parentheses to override precedence", () => {
    const result = new Parser("a && (b || c)").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: [
        "a",
        {
          type: "or",
          conditions: ["b", "c"],
        },
      ],
    });
  });

  test("parses nested parentheses", () => {
    const result = new Parser("(a > 5 && b < 10) || (c === 'test' && d !== null)").compile();
    expect(result.ast).toEqual({
      type: "or",
      conditions: [
        {
          type: "and",
          conditions: [
            {
              type: "compare",
              op: ">",
              left: { type: "ref", path: "a" },
              right: { type: "literal", value: 5 },
            },
            {
              type: "compare",
              op: "<",
              left: { type: "ref", path: "b" },
              right: { type: "literal", value: 10 },
            },
          ],
        },
        {
          type: "and",
          conditions: [
            {
              type: "compare",
              op: "===",
              left: { type: "ref", path: "c" },
              right: { type: "literal", value: "test" },
            },
            {
              type: "compare",
              op: "!==",
              left: { type: "ref", path: "d" },
              right: { type: "literal", value: null },
            },
          ],
        },
      ],
    });
  });

  test("parses NOT with parentheses", () => {
    const result = new Parser("!(a > 5)").compile();
    expect(result.ast).toEqual({
      type: "not",
      condition: {
        type: "compare",
        op: ">",
        left: { type: "ref", path: "a" },
        right: { type: "literal", value: 5 },
      },
    });
  });

  test("parses complex nested condition", () => {
    const result = new Parser("!(a > 5) && (b === true || c === false)").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: [
        {
          type: "not",
          condition: {
            type: "compare",
            op: ">",
            left: { type: "ref", path: "a" },
            right: { type: "literal", value: 5 },
          },
        },
        {
          type: "or",
          conditions: [
            {
              type: "compare",
              op: "===",
              left: { type: "ref", path: "b" },
              right: { type: "literal", value: true },
            },
            {
              type: "compare",
              op: "===",
              left: { type: "ref", path: "c" },
              right: { type: "literal", value: false },
            },
          ],
        },
      ],
    });
  });
});

describe("Parser - Function calls", () => {
  test("parses function with no args", () => {
    const result = new Parser("isEmpty()").compile();
    expect(result.ast).toEqual({
      type: "fn",
      name: "isEmpty",
      args: [],
    });
  });

  test("parses function with single arg", () => {
    const result = new Parser("isEmpty(context.name)").compile();
    expect(result.ast).toEqual({
      type: "fn",
      name: "isEmpty",
      args: [{ type: "ref", path: "context.name" }],
    });
  });

  test("parses function with multiple args", () => {
    const result = new Parser("match(status, 'active', 'pending')").compile();
    expect(result.ast).toEqual({
      type: "fn",
      name: "match",
      args: [
        { type: "ref", path: "status" },
        { type: "literal", value: "active" },
        { type: "literal", value: "pending" },
      ],
    });
  });

  test("parses function in AND expression", () => {
    const result = new Parser("isEmpty(context.name) && isDefined(event.value)").compile();
    expect(result.ast).toEqual({
      type: "and",
      conditions: [
        {
          type: "fn",
          name: "isEmpty",
          args: [{ type: "ref", path: "context.name" }],
        },
        {
          type: "fn",
          name: "isDefined",
          args: [{ type: "ref", path: "event.value" }],
        },
      ],
    });
  });

  test("parses function in comparison", () => {
    const result = new Parser("length(items) > 0").compile();
    expect(result.ast).toEqual({
      type: "compare",
      op: ">",
      left: {
        type: "fn",
        name: "length",
        args: [{ type: "ref", path: "items" }],
      },
      right: { type: "literal", value: 0 },
    });
  });
});

describe("Parser - Error cases", () => {
  test("throws on unexpected token", () => {
    expect(() => new Parser("context.value >").compile()).toThrow();
  });

  test("throws on missing closing paren", () => {
    expect(() => new Parser("(a && b").compile()).toThrow("Expected ')'");
  });

  test("throws on extra closing paren", () => {
    expect(() => new Parser("a && b)").compile()).toThrow("Unexpected token");
  });
});
