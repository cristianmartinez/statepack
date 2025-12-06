import { describe, expect, test } from "bun:test";
import type { GuardDefinition } from "../schema/types";
import {
  createGuardContext,
  evaluateGuard,
  findMatchingTransition,
  type GuardContext,
} from "./guards";

describe("evaluateGuard", () => {
  const createCtx = (overrides: Partial<GuardContext> = {}): GuardContext => ({
    context: { count: 5, name: "test" },
    event: { type: "TEST" },
    state: {
      value: "idle",
      matches: (pattern: string) => pattern === "idle",
    },
    ...overrides,
  });

  describe("no guard", () => {
    test("returns true for undefined guard", () => {
      const result = evaluateGuard(undefined, createCtx(), {});
      expect(result).toBe(true);
    });

    test("returns true for null guard", () => {
      const result = evaluateGuard(null, createCtx(), {});
      expect(result).toBe(true);
    });
  });

  describe("named guards", () => {
    const namedGuards: Record<string, GuardDefinition> = {
      isPositive: {
        condition: {
          type: "compare",
          op: ">",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 0 },
        },
      },
      isNegative: {
        condition: {
          type: "compare",
          op: "<",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 0 },
        },
      },
      isZero: {
        condition: {
          type: "compare",
          op: "==",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 0 },
        },
      },
    };

    test("evaluates named guard that returns true", () => {
      const ctx = createCtx({ context: { count: 10 } });
      const result = evaluateGuard("isPositive", ctx, namedGuards);
      expect(result).toBe(true);
    });

    test("evaluates named guard that returns false", () => {
      const ctx = createCtx({ context: { count: 10 } });
      const result = evaluateGuard("isNegative", ctx, namedGuards);
      expect(result).toBe(false);
    });

    test("returns false for unknown named guard", () => {
      const result = evaluateGuard("unknownGuard", createCtx(), namedGuards);
      expect(result).toBe(false);
    });
  });

  describe("inline condition guards", () => {
    test("evaluates compare condition (greater than)", () => {
      const ctx = createCtx({ context: { count: 10 } });
      const guard = {
        condition: {
          type: "compare",
          op: ">",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 5 },
        },
      };
      const result = evaluateGuard(guard, ctx, {});
      expect(result).toBe(true);
    });

    test("evaluates compare condition (less than)", () => {
      const ctx = createCtx({ context: { count: 3 } });
      const guard = {
        condition: {
          type: "compare",
          op: "<",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 5 },
        },
      };
      const result = evaluateGuard(guard, ctx, {});
      expect(result).toBe(true);
    });

    test("evaluates compare condition (equality)", () => {
      const ctx = createCtx({ context: { count: 5 } });
      const guard = {
        condition: {
          type: "compare",
          op: "==",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 5 },
        },
      };
      const result = evaluateGuard(guard, ctx, {});
      expect(result).toBe(true);
    });

    test("evaluates truthy string condition", () => {
      const ctx = createCtx({ context: { name: "test" } });
      const guard = {
        condition: "context.name",
      };
      const result = evaluateGuard(guard, ctx, {});
      expect(result).toBe(true);
    });

    test("evaluates falsy string condition", () => {
      const ctx = createCtx({ context: { name: "" } });
      const guard = {
        condition: "context.name",
      };
      const result = evaluateGuard(guard, ctx, {});
      expect(result).toBe(false);
    });
  });

  describe("composite guards", () => {
    const namedGuards: Record<string, GuardDefinition> = {
      isPositive: {
        condition: {
          type: "compare",
          op: ">",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 0 },
        },
      },
      isLessThan10: {
        condition: {
          type: "compare",
          op: "<",
          left: { type: "ref", path: "context.count" },
          right: { type: "literal", value: 10 },
        },
      },
    };

    test("evaluates AND guard (all true)", () => {
      const ctx = createCtx({ context: { count: 5 } });
      const guard = {
        and: ["isPositive", "isLessThan10"],
      };
      const result = evaluateGuard(guard, ctx, namedGuards);
      expect(result).toBe(true);
    });

    test("evaluates AND guard (one false)", () => {
      const ctx = createCtx({ context: { count: 15 } });
      const guard = {
        and: ["isPositive", "isLessThan10"],
      };
      const result = evaluateGuard(guard, ctx, namedGuards);
      expect(result).toBe(false);
    });

    test("evaluates OR guard (one true)", () => {
      const ctx = createCtx({ context: { count: 15 } });
      const guard = {
        or: ["isPositive", "isLessThan10"],
      };
      const result = evaluateGuard(guard, ctx, namedGuards);
      expect(result).toBe(true);
    });

    test("evaluates OR guard (all false)", () => {
      const ctx = createCtx({ context: { count: -5 } });
      const guard = {
        or: ["isPositive", "isLessThan10"],
      };
      // -5 is not > 0, but it IS < 10
      const result = evaluateGuard(guard, ctx, namedGuards);
      expect(result).toBe(true);
    });

    test("evaluates NOT guard", () => {
      const ctx = createCtx({ context: { count: -5 } });
      const guard = {
        not: "isPositive",
      };
      const result = evaluateGuard(guard, ctx, namedGuards);
      expect(result).toBe(true);
    });

    test("evaluates nested composite guards", () => {
      const ctx = createCtx({ context: { count: 5 } });
      const guard = {
        and: [
          "isPositive",
          {
            not: {
              condition: {
                type: "compare",
                op: ">=",
                left: { type: "ref", path: "context.count" },
                right: { type: "literal", value: 10 },
              },
            },
          },
        ],
      };
      const result = evaluateGuard(guard, ctx, namedGuards);
      expect(result).toBe(true);
    });
  });

  describe("event-based guards", () => {
    test("evaluates guard using event data", () => {
      const ctx = createCtx({
        context: { count: 5 },
        event: { type: "SET", value: 10 },
      });
      const guard = {
        condition: {
          type: "compare",
          op: ">",
          left: { type: "ref", path: "event.value" },
          right: { type: "ref", path: "context.count" },
        },
      };
      const result = evaluateGuard(guard, ctx, {});
      expect(result).toBe(true);
    });
  });
});

describe("findMatchingTransition", () => {
  const createCtx = (overrides: Partial<GuardContext> = {}): GuardContext => ({
    context: { count: 5 },
    event: { type: "TEST" },
    state: {
      value: "idle",
      matches: (pattern: string) => pattern === "idle",
    },
    ...overrides,
  });

  const namedGuards: Record<string, GuardDefinition> = {
    isPositive: {
      condition: {
        type: "compare",
        op: ">",
        left: { type: "ref", path: "context.count" },
        right: { type: "literal", value: 0 },
      },
    },
    isNegative: {
      condition: {
        type: "compare",
        op: "<",
        left: { type: "ref", path: "context.count" },
        right: { type: "literal", value: 0 },
      },
    },
  };

  test("returns undefined for undefined transitions", () => {
    const result = findMatchingTransition(undefined, createCtx(), {});
    expect(result).toBeUndefined();
  });

  test("returns string transition directly", () => {
    const result = findMatchingTransition("nextState", createCtx(), {});
    expect(result).toBe("nextState");
  });

  test("returns transition object when guard passes", () => {
    const ctx = createCtx({ context: { count: 10 } });
    const transition = { target: "positive", guard: "isPositive" };
    const result = findMatchingTransition(transition, ctx, namedGuards);
    expect(result).toEqual(transition);
  });

  test("returns undefined when guard fails", () => {
    const ctx = createCtx({ context: { count: -5 } });
    const transition = { target: "positive", guard: "isPositive" };
    const result = findMatchingTransition(transition, ctx, namedGuards);
    expect(result).toBeUndefined();
  });

  test("returns first matching transition from array", () => {
    const ctx = createCtx({ context: { count: 10 } });
    const transitions = [
      { target: "negative", guard: "isNegative" },
      { target: "positive", guard: "isPositive" },
      { target: "zero" },
    ];
    const result = findMatchingTransition(transitions, ctx, namedGuards);
    expect(result).toEqual({ target: "positive", guard: "isPositive" });
  });

  test("returns fallback transition when no guards match", () => {
    const ctx = createCtx({ context: { count: 0 } });
    const transitions = [
      { target: "negative", guard: "isNegative" },
      { target: "positive", guard: "isPositive" },
      { target: "zero" },
    ];
    const result = findMatchingTransition(transitions, ctx, namedGuards);
    expect(result).toEqual({ target: "zero" });
  });

  test("returns undefined when no transitions match", () => {
    const ctx = createCtx({ context: { count: 0 } });
    const transitions = [
      { target: "negative", guard: "isNegative" },
      { target: "positive", guard: "isPositive" },
    ];
    const result = findMatchingTransition(transitions, ctx, namedGuards);
    expect(result).toBeUndefined();
  });

  test("returns string from array of transitions", () => {
    const transitions = ["firstState", { target: "secondState", guard: "isPositive" }];
    const result = findMatchingTransition(transitions, createCtx(), namedGuards);
    expect(result).toBe("firstState");
  });
});

describe("createGuardContext", () => {
  test("creates guard context from state and event", () => {
    const state = {
      value: "loading",
      context: { count: 42, name: "test" },
      done: false,
    };
    const event = { type: "LOAD", data: { id: 1 } };
    const matchFn = (pattern: string) => pattern === "loading";

    const ctx = createGuardContext(state, event, matchFn);

    expect(ctx.context).toEqual({ count: 42, name: "test" });
    expect(ctx.event).toEqual({ type: "LOAD", data: { id: 1 } });
    expect(ctx.state.value).toBe("loading");
    expect(ctx.state.matches("loading")).toBe(true);
    expect(ctx.state.matches("idle")).toBe(false);
  });
});
