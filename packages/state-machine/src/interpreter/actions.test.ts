import { describe, expect, test } from "bun:test";
import { compileExpression } from "@ouni/expressions";
import type { CompiledCache } from "../compiler/types";
import { executeActions, normalizeActions, type ActionContext } from "./actions";

/**
 * Helper to create a compiled cache with expressions
 */
function createCompiledCache(expressions: string[]): CompiledCache {
  const cache: CompiledCache = {
    guards: new Map(),
    expressions: new Map(),
  };

  for (const expr of expressions) {
    try {
      const compiled = compileExpression(expr);
      cache.expressions.set(expr, { source: expr, compiled });
    } catch {
      // Skip invalid expressions
    }
  }

  return cache;
}

describe("executeActions", () => {
  describe("assign action", () => {
    test("assigns literal values", async () => {
      const compiled = createCompiledCache(["42", "'hello'"]);
      const ctx: ActionContext = {
        context: { count: 0 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "assign", values: { count: "42", name: "'hello'" } }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(42);
      expect(result.context.name).toBe("hello");
    });

    test("assigns from context", async () => {
      const compiled = createCompiledCache(["context.count + 1"]);
      const ctx: ActionContext = {
        context: { count: 5 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "assign", values: { count: "context.count + 1" } }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(6);
    });

    test("assigns from event payload", async () => {
      const compiled = createCompiledCache(["event.value"]);
      const ctx: ActionContext = {
        context: { count: 0 },
        event: { type: "SET", value: 42 },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "assign", values: { count: "event.value" } }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(42);
    });

    test("handles multiple assignments in sequence", async () => {
      const compiled = createCompiledCache(["context.count + 1", "context.count * 2"]);
      const ctx: ActionContext = {
        context: { count: 5 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [
          { type: "assign", values: { count: "context.count + 1" } },
          { type: "assign", values: { count: "context.count * 2" } },
        ],
        ctx,
        { namedActions: {}, compiled }
      );

      // First: 5 + 1 = 6, Second: 6 * 2 = 12
      expect(result.context.count).toBe(12);
    });
  });

  describe("raise action", () => {
    test("raises an event", async () => {
      const compiled = createCompiledCache(["'NEXT'"]);
      const ctx: ActionContext = {
        context: {},
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions([{ type: "raise", event: "'NEXT'" }], ctx, {
        namedActions: {},
        compiled,
      });

      expect(result.raisedEvents).toEqual([{ type: "NEXT" }]);
    });

    test("raises event with payload", async () => {
      const compiled = createCompiledCache(["'UPDATE'", "context.count"]);
      const ctx: ActionContext = {
        context: { count: 42 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "raise", event: "'UPDATE'", payload: { value: "context.count" } }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.raisedEvents).toEqual([{ type: "UPDATE", value: 42 }]);
    });
  });

  describe("send action", () => {
    test("sends an event", async () => {
      const compiled = createCompiledCache(["'DELAYED'"]);
      const ctx: ActionContext = {
        context: {},
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions([{ type: "send", event: "'DELAYED'" }], ctx, {
        namedActions: {},
        compiled,
      });

      expect(result.sentEvents).toEqual([{ event: { type: "DELAYED" } }]);
    });

    test("sends event with delay", async () => {
      const compiled = createCompiledCache(["'TIMEOUT'"]);
      const ctx: ActionContext = {
        context: {},
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "send", event: "'TIMEOUT'", delay: 1000 }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.sentEvents).toEqual([{ event: { type: "TIMEOUT" }, delay: 1000 }]);
    });

    test("sends event with payload", async () => {
      const compiled = createCompiledCache(["'DATA'", "context.items"]);
      const ctx: ActionContext = {
        context: { items: [1, 2, 3] },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "send", event: "'DATA'", payload: { data: "context.items" } }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.sentEvents).toEqual([{ event: { type: "DATA", data: [1, 2, 3] } }]);
    });
  });

  describe("conditional action", () => {
    test("executes then branch when condition is true", async () => {
      const compiled = createCompiledCache(["context.count + 1"]);
      const ctx: ActionContext = {
        context: { count: 5, isPositive: true },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [
          {
            type: "conditional",
            condition: {
              type: "compare",
              op: ">",
              left: { type: "ref", path: "context.count" },
              right: { type: "literal", value: 0 },
            },
            then: [{ type: "assign", values: { count: "context.count + 1" } }],
            else: [{ type: "assign", values: { count: "0" } }],
          },
        ],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(6);
    });

    test("executes else branch when condition is false", async () => {
      const compiled = createCompiledCache(["0", "context.count + 1"]);
      const ctx: ActionContext = {
        context: { count: -5 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [
          {
            type: "conditional",
            condition: {
              type: "compare",
              op: ">",
              left: { type: "ref", path: "context.count" },
              right: { type: "literal", value: 0 },
            },
            then: [{ type: "assign", values: { count: "context.count + 1" } }],
            else: [{ type: "assign", values: { count: "0" } }],
          },
        ],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(0);
    });

    test("skips else branch if not provided", async () => {
      const compiled = createCompiledCache(["context.count + 1"]);
      const ctx: ActionContext = {
        context: { count: -5 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [
          {
            type: "conditional",
            condition: {
              type: "compare",
              op: ">",
              left: { type: "ref", path: "context.count" },
              right: { type: "literal", value: 0 },
            },
            then: [{ type: "assign", values: { count: "context.count + 1" } }],
          },
        ],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(-5); // Unchanged
    });
  });

  describe("effect actions", () => {
    test("collects log effect", async () => {
      const compiled = createCompiledCache(["context.message"]);
      const ctx: ActionContext = {
        context: { message: "Hello" },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions([{ type: "log", message: "context.message" }], ctx, {
        namedActions: {},
        compiled,
      });

      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe("log");
      expect(result.effects[0].params.message).toBe("Hello");
    });

    test("collects navigate effect", async () => {
      const compiled = createCompiledCache(["'/home'"]);
      const ctx: ActionContext = {
        context: {},
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions([{ type: "navigate", to: "'/home'" }], ctx, {
        namedActions: {},
        compiled,
      });

      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe("navigate");
      expect(result.effects[0].params.to).toBe("/home");
    });

    test("collects toast effect", async () => {
      const compiled = createCompiledCache(["'Success!'", "'success'"]);
      const ctx: ActionContext = {
        context: {},
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(
        [{ type: "toast", message: "'Success!'", variant: "'success'" }],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe("toast");
      expect(result.effects[0].params.message).toBe("Success!");
      expect(result.effects[0].params.variant).toBe("success");
    });
  });

  describe("named actions", () => {
    test("resolves and executes named action", async () => {
      const compiled = createCompiledCache(["context.count + 1"]);
      const ctx: ActionContext = {
        context: { count: 0 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(["increment"], ctx, {
        namedActions: {
          increment: { type: "assign", values: { count: "context.count + 1" } },
        },
        compiled,
      });

      expect(result.context.count).toBe(1);
    });

    test("resolves named action that is an array", async () => {
      const compiled = createCompiledCache(["context.count + 1", "'UPDATED'"]);
      const ctx: ActionContext = {
        context: { count: 0 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(["incrementAndNotify"], ctx, {
        namedActions: {
          incrementAndNotify: [
            { type: "assign", values: { count: "context.count + 1" } },
            { type: "raise", event: "'UPDATED'" },
          ],
        },
        compiled,
      });

      expect(result.context.count).toBe(1);
      expect(result.raisedEvents).toEqual([{ type: "UPDATED" }]);
    });

    test("warns for unknown named action", async () => {
      const ctx: ActionContext = {
        context: {},
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(["unknownAction"], ctx, {
        namedActions: {},
        compiled: createCompiledCache([]),
      });

      // Should not throw, just warn
      expect(result.context).toEqual({});
    });
  });

  describe("empty and undefined actions", () => {
    test("handles undefined actions", async () => {
      const ctx: ActionContext = {
        context: { count: 5 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions(undefined, ctx, { namedActions: {} });

      expect(result.context).toEqual({ count: 5 });
      expect(result.raisedEvents).toEqual([]);
      expect(result.sentEvents).toEqual([]);
      expect(result.effects).toEqual([]);
    });

    test("handles empty array", async () => {
      const ctx: ActionContext = {
        context: { count: 5 },
        event: { type: "TEST" },
        state: { value: "idle" },
      };

      const result = await executeActions([], ctx, { namedActions: {} });

      expect(result.context).toEqual({ count: 5 });
    });
  });

  describe("mixed action types", () => {
    test("executes multiple action types in sequence", async () => {
      const compiled = createCompiledCache([
        "context.count + 1",
        "'COUNT_UPDATED'",
        "'Incremented!'",
      ]);
      const ctx: ActionContext = {
        context: { count: 0 },
        event: { type: "INCREMENT" },
        state: { value: "active" },
      };

      const result = await executeActions(
        [
          { type: "assign", values: { count: "context.count + 1" } },
          { type: "raise", event: "'COUNT_UPDATED'" },
          { type: "log", message: "'Incremented!'" },
        ],
        ctx,
        { namedActions: {}, compiled }
      );

      expect(result.context.count).toBe(1);
      expect(result.raisedEvents).toEqual([{ type: "COUNT_UPDATED" }]);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe("log");
    });
  });
});

describe("normalizeActions", () => {
  test("returns empty array for undefined", () => {
    expect(normalizeActions(undefined)).toEqual([]);
  });

  test("returns array as-is", () => {
    const actions = [{ type: "assign", values: {} }];
    expect(normalizeActions(actions)).toBe(actions);
  });

  test("wraps single action in array", () => {
    const action = { type: "assign", values: {} };
    expect(normalizeActions(action)).toEqual([action]);
  });

  test("wraps string action in array", () => {
    expect(normalizeActions("increment")).toEqual(["increment"]);
  });
});
