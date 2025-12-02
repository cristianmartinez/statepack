import { describe, expect, test } from "bun:test";
import { evaluate, createEvaluator } from "./evaluate.ts";
import type { Condition, Scope } from "./types.ts";

describe("evaluate", () => {
  describe("string shorthand (truthy)", () => {
    test("returns true for truthy path value", () => {
      const scope: Scope = { context: { isLoggedIn: true } };
      expect(evaluate("context.isLoggedIn", scope)).toBe(true);
    });

    test("returns false for falsy path value", () => {
      const scope: Scope = { context: { isLoggedIn: false } };
      expect(evaluate("context.isLoggedIn", scope)).toBe(false);
    });

    test("returns false for undefined path", () => {
      const scope: Scope = { context: {} };
      expect(evaluate("context.user.name", scope)).toBe(false);
    });

    test("handles nested paths", () => {
      const scope: Scope = { context: { user: { profile: { verified: true } } } };
      expect(evaluate("context.user.profile.verified", scope)).toBe(true);
    });
  });

  describe("boolean literal", () => {
    test("returns true for true", () => {
      expect(evaluate(true, {})).toBe(true);
    });

    test("returns false for false", () => {
      expect(evaluate(false, {})).toBe(false);
    });
  });

  describe("truthy condition", () => {
    test("evaluates truthy condition", () => {
      const scope: Scope = { context: { count: 5 } };
      const condition: Condition = { type: "truthy", path: "context.count" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("handles optional chaining", () => {
      const scope: Scope = { context: {} };
      const condition: Condition = {
        type: "truthy",
        path: "context.user.profile.name",
        optional: true,
      };
      expect(evaluate(condition, scope)).toBe(false);
    });
  });

  describe("literal condition", () => {
    test("returns true for truthy literal", () => {
      const condition: Condition = { type: "literal", value: "hello" };
      expect(evaluate(condition, {})).toBe(true);
    });

    test("returns false for falsy literal", () => {
      const condition: Condition = { type: "literal", value: 0 };
      expect(evaluate(condition, {})).toBe(false);
    });
  });

  describe("compare condition", () => {
    const scope: Scope = {
      context: { count: 5, status: "active", user: { role: "admin" } },
      params: { authorId: "123" },
    };

    test("strict equality", () => {
      const condition: Condition = {
        type: "compare",
        op: "===",
        left: "context.status",
        right: "active",
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("strict inequality", () => {
      const condition: Condition = {
        type: "compare",
        op: "!==",
        left: "context.status",
        right: "inactive",
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("greater than", () => {
      const condition: Condition = {
        type: "compare",
        op: ">",
        left: "context.count",
        right: 3,
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("less than", () => {
      const condition: Condition = {
        type: "compare",
        op: "<",
        left: "context.count",
        right: 10,
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("compares ref to ref", () => {
      const scope2: Scope = {
        context: { userId: "123" },
        params: { authorId: "123" },
      };
      const condition: Condition = {
        type: "compare",
        op: "===",
        left: "context.userId",
        right: { type: "ref", path: "params.authorId" },
      };
      expect(evaluate(condition, scope2)).toBe(true);
    });

    test("explicit literal value", () => {
      const condition: Condition = {
        type: "compare",
        op: "===",
        left: { type: "ref", path: "context.count" },
        right: { type: "literal", value: 5 },
      };
      expect(evaluate(condition, scope)).toBe(true);
    });
  });

  describe("logical conditions", () => {
    const scope: Scope = {
      context: {
        isLoggedIn: true,
        isVerified: true,
        isBlocked: false,
        items: [1, 2, 3],
      },
    };

    test("and - all true", () => {
      const condition: Condition = {
        type: "and",
        conditions: ["context.isLoggedIn", "context.isVerified"],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("and - one false", () => {
      const condition: Condition = {
        type: "and",
        conditions: ["context.isLoggedIn", "context.isBlocked"],
      };
      expect(evaluate(condition, scope)).toBe(false);
    });

    test("or - one true", () => {
      const condition: Condition = {
        type: "or",
        conditions: ["context.isBlocked", "context.isLoggedIn"],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("or - all false", () => {
      const scope2: Scope = { context: { a: false, b: false } };
      const condition: Condition = {
        type: "or",
        conditions: ["context.a", "context.b"],
      };
      expect(evaluate(condition, scope2)).toBe(false);
    });

    test("not", () => {
      const condition: Condition = {
        type: "not",
        condition: "context.isBlocked",
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("nested logic", () => {
      const condition: Condition = {
        type: "and",
        conditions: [
          "context.isLoggedIn",
          {
            type: "or",
            conditions: ["context.isVerified", "context.isBlocked"],
          },
          {
            type: "not",
            condition: "context.isBlocked",
          },
        ],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });
  });

  describe("exists conditions", () => {
    const scope: Scope = {
      context: {
        user: { name: "John" },
        error: null,
        items: [],
        data: { key: "value" },
        emptyStr: "",
      },
    };

    test("isDefined - defined value", () => {
      const condition: Condition = { type: "isDefined", path: "context.user" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("isDefined - undefined value", () => {
      const condition: Condition = { type: "isDefined", path: "context.notHere" };
      expect(evaluate(condition, scope)).toBe(false);
    });

    test("isDefined - null value", () => {
      const condition: Condition = { type: "isDefined", path: "context.error" };
      expect(evaluate(condition, scope)).toBe(false);
    });

    test("isNull", () => {
      const condition: Condition = { type: "isNull", path: "context.error" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("isEmpty - empty array", () => {
      const condition: Condition = { type: "isEmpty", path: "context.items" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("isEmpty - empty string", () => {
      const condition: Condition = { type: "isEmpty", path: "context.emptyStr" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("isNotEmpty - non-empty object", () => {
      const condition: Condition = { type: "isNotEmpty", path: "context.data" };
      expect(evaluate(condition, scope)).toBe(true);
    });
  });

  describe("function conditions", () => {
    test("includes", () => {
      const scope: Scope = { context: { tags: ["featured", "new", "sale"] } };
      const condition: Condition = {
        type: "fn",
        name: "includes",
        args: ["context.tags", "featured"],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("length", () => {
      const scope: Scope = { context: { items: [1, 2, 3] } };
      const condition: Condition = {
        type: "compare",
        op: ">",
        left: { type: "fn", name: "length", args: ["context.items"] } as any,
        right: 2,
      };
      // Note: fn in compare left is not directly supported, test includes separately
      const fnCondition: Condition = {
        type: "fn",
        name: "length",
        args: ["context.items"],
      };
      expect(evaluate(fnCondition, scope)).toBe(true); // 3 > 0
    });

    test("startsWith", () => {
      const scope: Scope = { context: { url: "https://example.com" } };
      const condition: Condition = {
        type: "fn",
        name: "startsWith",
        args: ["context.url", "https"],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("between", () => {
      const scope: Scope = { context: { age: 25 } };
      const condition: Condition = {
        type: "fn",
        name: "between",
        args: ["context.age", 18, 65],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("some", () => {
      const scope: Scope = {
        context: {
          items: [
            { name: "a", selected: false },
            { name: "b", selected: true },
          ],
        },
      };
      const condition: Condition = {
        type: "fn",
        name: "some",
        args: ["context.items", "selected"],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("every", () => {
      const scope: Scope = {
        context: {
          items: [
            { valid: true },
            { valid: true },
          ],
        },
      };
      const condition: Condition = {
        type: "fn",
        name: "every",
        args: ["context.items", "valid"],
      };
      expect(evaluate(condition, scope)).toBe(true);
    });
  });

  describe("match condition", () => {
    test("matches case", () => {
      const scope: Scope = { context: { status: "loading" } };
      const condition: Condition = {
        type: "match",
        value: "context.status",
        cases: {
          loading: true,
          error: false,
          success: true,
        },
        default: false,
      };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("uses default", () => {
      const scope: Scope = { context: { status: "unknown" } };
      const condition: Condition = {
        type: "match",
        value: "context.status",
        cases: {
          loading: true,
          error: false,
        },
        default: false,
      };
      expect(evaluate(condition, scope)).toBe(false);
    });

    test("case with nested condition", () => {
      const scope: Scope = {
        context: { status: "user", user: { reputation: 150 } },
      };
      const condition: Condition = {
        type: "match",
        value: "context.status",
        cases: {
          admin: true,
          user: {
            type: "compare",
            op: ">",
            left: "context.user.reputation",
            right: 100,
          },
        },
        default: false,
      };
      expect(evaluate(condition, scope)).toBe(true);
    });
  });

  describe("state condition", () => {
    test("matches state", () => {
      const scope: Scope = { state: { value: "loading" } };
      const condition: Condition = { type: "state", matches: "loading" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("matches nested state", () => {
      const scope: Scope = { state: { value: "authenticated.settings.security" } };
      const condition: Condition = { type: "state", matches: "authenticated.settings" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("hasTag", () => {
      const scope: Scope = { state: { value: "loading", tags: ["busy", "fetching"] } };
      const condition: Condition = { type: "state", hasTag: "busy" };
      expect(evaluate(condition, scope)).toBe(true);
    });

    test("returns false when no state", () => {
      const condition: Condition = { type: "state", matches: "loading" };
      expect(evaluate(condition, {})).toBe(false);
    });
  });

  describe("named conditions", () => {
    test("resolves named condition", () => {
      const scope: Scope = { context: { user: { role: "admin" } } };
      const condition: Condition = { type: "named", name: "isAdmin" };
      const options = {
        namedConditions: {
          isAdmin: {
            type: "compare" as const,
            op: "===" as const,
            left: "context.user.role",
            right: "admin",
          },
        },
      };
      expect(evaluate(condition, scope, options)).toBe(true);
    });

    test("throws for unknown named condition", () => {
      const condition: Condition = { type: "named", name: "unknown" };
      expect(() => evaluate(condition, {})).toThrow("Unknown named condition: unknown");
    });
  });

  describe("createEvaluator", () => {
    test("creates evaluator with preset options", () => {
      const evaluator = createEvaluator({
        namedConditions: {
          isActive: { type: "truthy", path: "context.active" },
        },
      });

      const scope: Scope = { context: { active: true } };
      expect(evaluator({ type: "named", name: "isActive" }, scope)).toBe(true);
    });
  });
});
