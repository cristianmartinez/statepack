import { describe, expect, test } from "bun:test";
import { compile, compileToAST } from "./index";
import { evaluate } from "../evaluate";

describe("Compiler - compile() returns CompiledCondition", () => {
  test("returns source and ast", () => {
    const result = compile("context.isLoggedIn");
    expect(result).toHaveProperty("source");
    expect(result).toHaveProperty("ast");
    expect(result.source).toBe("context.isLoggedIn");
    expect(result.ast).toBe("context.isLoggedIn");
  });

  test("compiles complex expression", () => {
    const result = compile("age > 18 && role === 'admin'");
    expect(result.source).toBe("age > 18 && role === 'admin'");
    expect(result.ast).toEqual({
      type: "and",
      conditions: [
        {
          type: "compare",
          op: ">",
          left: { type: "ref", path: "age" },
          right: { type: "literal", value: 18 },
        },
        {
          type: "compare",
          op: "===",
          left: { type: "ref", path: "role" },
          right: { type: "literal", value: "admin" },
        },
      ],
    });
  });
});

describe("Compiler - compileToAST() returns just AST", () => {
  test("returns ast directly", () => {
    const result = compileToAST("context.isLoggedIn");
    expect(result).toBe("context.isLoggedIn");
  });

  test("compiles to structured AST", () => {
    const result = compileToAST("age > 18");
    expect(result).toEqual({
      type: "compare",
      op: ">",
      left: { type: "ref", path: "age" },
      right: { type: "literal", value: 18 },
    });
  });
});

describe("Compiler + Evaluator integration", () => {
  test("compiles and evaluates simple truthy", () => {
    const condition = compileToAST("context.isLoggedIn");
    const scope = { context: { isLoggedIn: true } };
    expect(evaluate(condition, scope)).toBe(true);
  });

  test("compiles and evaluates comparison", () => {
    const condition = compileToAST("context.count > 5");
    expect(evaluate(condition, { context: { count: 10 } })).toBe(true);
    expect(evaluate(condition, { context: { count: 3 } })).toBe(false);
  });

  test("compiles and evaluates AND", () => {
    const condition = compileToAST("context.a && context.b");
    expect(evaluate(condition, { context: { a: true, b: true } })).toBe(true);
    expect(evaluate(condition, { context: { a: true, b: false } })).toBe(false);
  });

  test("compiles and evaluates OR", () => {
    const condition = compileToAST("context.a || context.b");
    expect(evaluate(condition, { context: { a: true, b: false } })).toBe(true);
    expect(evaluate(condition, { context: { a: false, b: false } })).toBe(false);
  });

  test("compiles and evaluates NOT", () => {
    const condition = compileToAST("!context.active");
    expect(evaluate(condition, { context: { active: false } })).toBe(true);
    expect(evaluate(condition, { context: { active: true } })).toBe(false);
  });

  test("compiles and evaluates string comparison", () => {
    const condition = compileToAST("context.role === 'admin'");
    expect(evaluate(condition, { context: { role: "admin" } })).toBe(true);
    expect(evaluate(condition, { context: { role: "user" } })).toBe(false);
  });

  test("compiles and evaluates complex expression", () => {
    const condition = compileToAST("context.isLoggedIn && context.items.length > 0");
    const scope = { context: { isLoggedIn: true, items: [1, 2, 3] } };
    expect(evaluate(condition, scope)).toBe(true);
  });

  test("compiles and evaluates nested parentheses", () => {
    const condition = compileToAST("(a > 5 && b < 10) || (c === 'test')");
    expect(evaluate(condition, { a: 6, b: 9, c: "test" })).toBe(true);
    expect(evaluate(condition, { a: 4, b: 9, c: "test" })).toBe(true);
    expect(evaluate(condition, { a: 4, b: 9, c: "other" })).toBe(false);
  });

  test("compiles and evaluates operator precedence", () => {
    const condition = compileToAST("a && b || c");
    // Should parse as (a && b) || c
    expect(evaluate(condition, { a: false, b: true, c: true })).toBe(true);
    expect(evaluate(condition, { a: false, b: false, c: false })).toBe(false);
  });

  test("compiles and evaluates function call", () => {
    const condition = compileToAST("isEmpty(context.name)");
    expect(evaluate(condition, { context: { name: "" } })).toBe(true);
    expect(evaluate(condition, { context: { name: "John" } })).toBe(false);
  });

  test("compiles and evaluates isDefined", () => {
    const condition = compileToAST("isDefined(context.user)");
    expect(evaluate(condition, { context: { user: { name: "John" } } })).toBe(true);
    expect(evaluate(condition, { context: {} })).toBe(false);
  });

  test("compiles and evaluates complex condition with functions", () => {
    const condition = compileToAST("isEmpty(context.name) && isDefined(event.value)");
    expect(
      evaluate(condition, {
        context: { name: "" },
        event: { value: "test" },
      })
    ).toBe(true);
    expect(
      evaluate(condition, {
        context: { name: "John" },
        event: { value: "test" },
      })
    ).toBe(false);
  });
});

describe("Compiler - Real-world examples", () => {
  test("user authentication check", () => {
    const condition = compileToAST("context.user.isLoggedIn && context.user.role === 'admin'");
    expect(
      evaluate(condition, {
        context: { user: { isLoggedIn: true, role: "admin" } },
      })
    ).toBe(true);
  });

  test("form validation", () => {
    const condition = compileToAST(
      "!isEmpty(form.email) && !isEmpty(form.password) && form.termsAccepted"
    );
    expect(
      evaluate(condition, {
        form: { email: "test@example.com", password: "secret", termsAccepted: true },
      })
    ).toBe(true);
  });

  test("feature flag check", () => {
    const condition = compileToAST(
      "(context.user.tier === 'premium' || context.user.tier === 'enterprise') && context.features.aiEnabled"
    );
    expect(
      evaluate(condition, {
        context: {
          user: { tier: "premium" },
          features: { aiEnabled: true },
        },
      })
    ).toBe(true);
  });

  test("cart validation", () => {
    const condition = compileToAST("cart.items.length > 0 && cart.total > 0 && isDefined(user.email)");
    expect(
      evaluate(condition, {
        cart: { items: [1, 2], total: 50 },
        user: { email: "test@example.com" },
      })
    ).toBe(true);
  });
});
