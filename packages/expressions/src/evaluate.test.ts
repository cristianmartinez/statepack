import { describe, expect, test } from "bun:test";
import { evaluate, evaluateTemplate, createEvaluator } from "./evaluate";
import type { Scope } from "./types";

describe("evaluate", () => {
  describe("path access", () => {
    test("gets value from context", () => {
      const scope: Scope = { context: { user: { name: "John" } } };
      expect(evaluate("context.user.name", scope)).toBe("John");
    });

    test("gets value from params", () => {
      const scope: Scope = { params: { id: "123" } };
      expect(evaluate("params.id", scope)).toBe("123");
    });

    test("gets value from event", () => {
      const scope: Scope = { event: { value: "hello" } };
      expect(evaluate("event.value", scope)).toBe("hello");
    });

    test("gets index value", () => {
      const scope: Scope = { index: 5 };
      expect(evaluate("index", scope)).toBe(5);
    });

    test("gets item value", () => {
      const scope: Scope = { item: { id: 1, name: "Test" } };
      expect(evaluate("item.name", scope)).toBe("Test");
    });

    test("returns undefined for missing path", () => {
      const scope: Scope = { context: {} };
      expect(evaluate("context.user.name", scope)).toBeUndefined();
    });

    test("handles array access", () => {
      const scope: Scope = { context: { items: ["a", "b", "c"] } };
      expect(evaluate("context.items[0]", scope)).toBe("a");
      expect(evaluate("context.items[1]", scope)).toBe("b");
    });

    test("handles negative array access", () => {
      const scope: Scope = { context: { items: ["a", "b", "c"] } };
      expect(evaluate("context.items[-1]", scope)).toBe("c");
    });
  });

  describe("string transforms", () => {
    test("uppercase", () => {
      const scope: Scope = { context: { name: "john" } };
      expect(evaluate("context.name | uppercase", scope)).toBe("JOHN");
    });

    test("lowercase", () => {
      const scope: Scope = { context: { name: "JOHN" } };
      expect(evaluate("context.name | lowercase", scope)).toBe("john");
    });

    test("capitalize", () => {
      const scope: Scope = { context: { name: "john" } };
      expect(evaluate("context.name | capitalize", scope)).toBe("John");
    });

    test("trim", () => {
      const scope: Scope = { context: { name: "  john  " } };
      expect(evaluate("context.name | trim", scope)).toBe("john");
    });

    test("truncate", () => {
      const scope: Scope = { context: { text: "Hello, World!" } };
      expect(evaluate("context.text | truncate:8", scope)).toBe("Hello, …");
    });

    test("replace", () => {
      const scope: Scope = { context: { text: "hello world" } };
      expect(evaluate("context.text | replace:'world':'there'", scope)).toBe("hello there");
    });

    test("split", () => {
      const scope: Scope = { context: { tags: "a,b,c" } };
      expect(evaluate("context.tags | split:','", scope)).toEqual(["a", "b", "c"]);
    });

    test("concat", () => {
      const scope: Scope = { context: { firstName: "John", lastName: "Doe" } };
      expect(evaluate("context.firstName | concat:' ':$context.lastName", scope)).toBe("John Doe");
    });
  });

  describe("number transforms", () => {
    test("round", () => {
      const scope: Scope = { context: { price: 19.567 } };
      expect(evaluate("context.price | round:2", scope)).toBe(19.57);
    });

    test("add", () => {
      const scope: Scope = { context: { count: 5 } };
      expect(evaluate("context.count | add:1", scope)).toBe(6);
    });

    test("multiply with path reference", () => {
      const scope: Scope = { context: { price: 10, quantity: 3 } };
      expect(evaluate("context.price | multiply:$context.quantity", scope)).toBe(30);
    });

    test("clamp", () => {
      const scope: Scope = { context: { volume: 150 } };
      expect(evaluate("context.volume | clamp:0:100", scope)).toBe(100);
    });
  });

  describe("array transforms", () => {
    test("length", () => {
      const scope: Scope = { context: { items: [1, 2, 3] } };
      expect(evaluate("context.items | length", scope)).toBe(3);
    });

    test("first", () => {
      const scope: Scope = { context: { items: ["a", "b", "c"] } };
      expect(evaluate("context.items | first", scope)).toBe("a");
    });

    test("last", () => {
      const scope: Scope = { context: { items: ["a", "b", "c"] } };
      expect(evaluate("context.items | last", scope)).toBe("c");
    });

    test("filter by truthy property", () => {
      const scope: Scope = {
        context: {
          items: [
            { name: "a", active: true },
            { name: "b", active: false },
            { name: "c", active: true },
          ],
        },
      };
      const result = evaluate("context.items | filter:'active'", scope) as unknown[];
      expect(result).toHaveLength(2);
    });

    test("map property", () => {
      const scope: Scope = {
        context: {
          users: [
            { name: "John" },
            { name: "Jane" },
          ],
        },
      };
      expect(evaluate("context.users | map:'name'", scope)).toEqual(["John", "Jane"]);
    });

    test("sortBy", () => {
      const scope: Scope = {
        context: {
          users: [
            { name: "Charlie" },
            { name: "Alice" },
            { name: "Bob" },
          ],
        },
      };
      const result = evaluate("context.users | sortBy:'name'", scope) as { name: string }[];
      expect(result[0]?.name).toBe("Alice");
      expect(result[2]?.name).toBe("Charlie");
    });

    test("take", () => {
      const scope: Scope = { context: { items: [1, 2, 3, 4, 5] } };
      expect(evaluate("context.items | take:3", scope)).toEqual([1, 2, 3]);
    });

    test("join", () => {
      const scope: Scope = { context: { tags: ["a", "b", "c"] } };
      expect(evaluate("context.tags | join:', '", scope)).toBe("a, b, c");
    });

    test("sum", () => {
      const scope: Scope = { context: { prices: [10, 20, 30] } };
      expect(evaluate("context.prices | sum", scope)).toBe(60);
    });

    test("sum with property", () => {
      const scope: Scope = {
        context: {
          items: [
            { price: 10 },
            { price: 20 },
            { price: 30 },
          ],
        },
      };
      expect(evaluate("context.items | sum:'price'", scope)).toBe(60);
    });

    test("append", () => {
      const scope: Scope = { context: { items: [1, 2] }, event: { item: 3 } };
      expect(evaluate("context.items | append:$event.item", scope)).toEqual([1, 2, 3]);
    });
  });

  describe("predicate transforms", () => {
    test("where with comparison", () => {
      const scope: Scope = {
        context: {
          items: [
            { id: 1, name: "a" },
            { id: 2, name: "b" },
            { id: 3, name: "c" },
          ],
        },
        event: { itemId: 2 },
      };
      const result = evaluate("context.items | where:'id != $event.itemId'", scope) as unknown[];
      expect(result).toHaveLength(2);
    });

    test("findWhere", () => {
      const scope: Scope = {
        context: {
          todos: [
            { id: 1, title: "First" },
            { id: 2, title: "Second" },
          ],
        },
        params: { todoId: 2 },
      };
      const result = evaluate("context.todos | findWhere:'id == $params.todoId'", scope) as { title: string };
      expect(result.title).toBe("Second");
    });

    test("removeWhere", () => {
      const scope: Scope = {
        context: {
          items: [
            { id: 1 },
            { id: 2 },
            { id: 3 },
          ],
        },
        event: { itemId: 2 },
      };
      const result = evaluate("context.items | removeWhere:'id == $event.itemId'", scope) as { id: number }[];
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual([1, 3]);
    });

    test("updateWhere", () => {
      const scope: Scope = {
        context: {
          todos: [
            { id: 1, completed: false },
            { id: 2, completed: false },
          ],
        },
        event: { todoId: 1 },
      };
      const result = evaluate("context.todos | updateWhere:'id == $event.todoId':completed:true", scope) as { id: number; completed: boolean }[];
      expect(result[0]?.completed).toBe(true);
      expect(result[1]?.completed).toBe(false);
    });
  });

  describe("object transforms", () => {
    test("keys", () => {
      const scope: Scope = { context: { obj: { a: 1, b: 2 } } };
      expect(evaluate("context.obj | keys", scope)).toEqual(["a", "b"]);
    });

    test("values", () => {
      const scope: Scope = { context: { obj: { a: 1, b: 2 } } };
      expect(evaluate("context.obj | values", scope)).toEqual([1, 2]);
    });

    test("set", () => {
      const scope: Scope = { context: { user: { name: "John" } }, event: { name: "Jane" } };
      const result = evaluate("context.user | set:'name':$event.name", scope) as { name: string };
      expect(result.name).toBe("Jane");
    });

    test("toggle", () => {
      const scope: Scope = { context: { item: { completed: false } } };
      const result = evaluate("context.item | toggle:'completed'", scope) as { completed: boolean };
      expect(result.completed).toBe(true);
    });

    test("merge", () => {
      const scope: Scope = {
        context: {
          defaults: { a: 1, b: 2 },
          overrides: { b: 3, c: 4 },
        },
      };
      const result = evaluate("context.defaults | merge:$context.overrides", scope) as Record<string, number>;
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });
  });

  describe("boolean transforms", () => {
    test("default", () => {
      const scope: Scope = { context: { name: null } };
      expect(evaluate("context.name | default:'Anonymous'", scope)).toBe("Anonymous");
    });

    test("not", () => {
      const scope: Scope = { context: { completed: true } };
      expect(evaluate("context.completed | not", scope)).toBe(false);
    });

    test("if true:then:else", () => {
      const scope: Scope = { context: { isActive: true } };
      expect(evaluate("context.isActive | if:true:'Active':'Inactive'", scope)).toBe("Active");
    });

    test("if false returns else", () => {
      const scope: Scope = { context: { isActive: false } };
      expect(evaluate("context.isActive | if:true:'Active':'Inactive'", scope)).toBe("Inactive");
    });

    test("eq", () => {
      const scope: Scope = { context: { status: "active" } };
      expect(evaluate("context.status | eq:'active'", scope)).toBe(true);
      expect(evaluate("context.status | eq:'inactive'", scope)).toBe(false);
    });
  });

  describe("format transforms", () => {
    test("currency", () => {
      const scope: Scope = { context: { price: 19.99 } };
      const result = evaluate("context.price | currency", scope) as string;
      expect(result).toContain("19.99");
    });

    test("ordinal", () => {
      const scope: Scope = { context: { rank: 1 } };
      expect(evaluate("context.rank | ordinal", scope)).toBe("1st");
    });

    test("pluralize", () => {
      const scope1: Scope = { context: { count: 1 } };
      const scope2: Scope = { context: { count: 5 } };
      expect(evaluate("context.count | pluralize:'item':'items'", scope1)).toBe("item");
      expect(evaluate("context.count | pluralize:'item':'items'", scope2)).toBe("items");
    });

    test("bytes", () => {
      const scope: Scope = { context: { size: 1536 } };
      expect(evaluate("context.size | bytes", scope)).toBe("1.5 KB");
    });
  });

  describe("chained transforms", () => {
    test("multiple string transforms", () => {
      const scope: Scope = { context: { name: "  JOHN DOE  " } };
      expect(evaluate("context.name | trim | lowercase | capitalize", scope)).toBe("John doe");
    });

    test("filter then map then join", () => {
      const scope: Scope = {
        context: {
          users: [
            { name: "John", active: true },
            { name: "Jane", active: false },
            { name: "Bob", active: true },
          ],
        },
      };
      expect(evaluate("context.users | filter:'active' | map:'name' | join:', '", scope)).toBe("John, Bob");
    });

    test("arithmetic chain", () => {
      const scope: Scope = { context: { price: 10, quantity: 3, tax: 1.1 } };
      expect(evaluate("context.price | multiply:$context.quantity | multiply:$context.tax | round:2", scope)).toBe(33);
    });
  });
});

describe("evaluateTemplate", () => {
  test("evaluates simple binding", () => {
    const scope: Scope = { context: { name: "John" } };
    expect(evaluateTemplate("Hello, {{context.name}}!", scope)).toBe("Hello, John!");
  });

  test("evaluates multiple bindings", () => {
    const scope: Scope = { context: { firstName: "John", lastName: "Doe" } };
    expect(evaluateTemplate("{{context.firstName}} {{context.lastName}}", scope)).toBe("John Doe");
  });

  test("evaluates binding with transform", () => {
    const scope: Scope = { context: { name: "john" } };
    expect(evaluateTemplate("Hello, {{context.name | uppercase}}!", scope)).toBe("Hello, JOHN!");
  });

  test("returns string without bindings unchanged", () => {
    expect(evaluateTemplate("Hello, World!", {})).toBe("Hello, World!");
  });

  test("handles null values", () => {
    const scope: Scope = { context: { name: null } };
    expect(evaluateTemplate("Hello, {{context.name | default:'Guest'}}!", scope)).toBe("Hello, Guest!");
  });
});

describe("createEvaluator", () => {
  test("creates evaluator with custom transforms", () => {
    const evaluator = createEvaluator({
      transforms: {
        double: (value) => Number(value) * 2,
      },
    });

    const scope: Scope = { context: { num: 5 } };
    expect(evaluator.evaluate("context.num | double", scope)).toBe(10);
  });
});
