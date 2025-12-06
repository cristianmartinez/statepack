import { describe, expect, test } from "bun:test";
import { compileData, isCompiledData, type DataDefinition } from "./index";

describe("compileData", () => {
  test("compiles query expressions", () => {
    const data: DataDefinition = {
      context: {
        todos: [],
        filter: "all",
      },
      queries: {
        completedTodos: "context.todos[completed = true]",
        pendingTodos: "context.todos[completed = false]",
        todoCount: "$count(context.todos)",
      },
    };

    const compiled = compileData(data);

    expect(isCompiledData(compiled)).toBe(true);
    expect(compiled.compiled.expressions.has("context.todos[completed = true]")).toBe(true);
    expect(compiled.compiled.expressions.has("context.todos[completed = false]")).toBe(true);
    expect(compiled.compiled.expressions.has("$count(context.todos)")).toBe(true);
  });

  test("compiles mutation expressions", () => {
    const data: DataDefinition = {
      context: {
        todos: [],
        input: "",
      },
      mutations: {
        addTodo: {
          todos: "$append(context.todos, { id: $uuid(), text: event.text, completed: false })",
          input: "''",
        },
        deleteTodo: {
          todos: "context.todos[id != event.id]",
        },
      },
    };

    const compiled = compileData(data);

    expect(
      compiled.compiled.expressions.has(
        "$append(context.todos, { id: $uuid(), text: event.text, completed: false })"
      )
    ).toBe(true);
    expect(compiled.compiled.expressions.has("''")).toBe(true);
    expect(compiled.compiled.expressions.has("context.todos[id != event.id]")).toBe(true);
  });

  test("compiles dynamic header values in sources", () => {
    const data: DataDefinition = {
      sources: {
        privateData: {
          url: "/api/private",
          headers: {
            Authorization: "'Bearer ' & context.authToken",
            "X-Request-ID": "$uuid()",
          },
        },
      },
    };

    const compiled = compileData(data);

    expect(compiled.compiled.expressions.has("'Bearer ' & context.authToken")).toBe(true);
    expect(compiled.compiled.expressions.has("$uuid()")).toBe(true);
  });

  test("includes metadata in compiled output", () => {
    const data: DataDefinition = {
      context: { count: 0 },
    };

    const compiled = compileData(data);

    expect(compiled.version).toBe("1.0.0");
    expect(typeof compiled.compiledAt).toBe("number");
    expect(compiled.source).toBe(data);
  });

  test("handles empty data definition", () => {
    const data: DataDefinition = {};

    const compiled = compileData(data);

    expect(isCompiledData(compiled)).toBe(true);
    expect(compiled.compiled.expressions.size).toBe(0);
  });

  test("stores compiled JSONata expression object", () => {
    const data: DataDefinition = {
      queries: {
        count: "$count(context.items)",
      },
    };

    const compiled = compileData(data);
    const expr = compiled.compiled.expressions.get("$count(context.items)");

    expect(expr).toBeDefined();
    expect(expr!.source).toBe("$count(context.items)");
    expect(expr!.compiled).toBeDefined();
    expect(expr!.compiled.expression).toBeDefined();
  });

  test("deduplicates identical expressions", () => {
    const data: DataDefinition = {
      queries: {
        count1: "$count(context.items)",
        count2: "$count(context.items)",
      },
      mutations: {
        clear: {
          items: "$count(context.items)",
        },
      },
    };

    const compiled = compileData(data);

    expect(compiled.compiled.expressions.size).toBe(1);
  });

  test("compiles nested object expressions in mutations", () => {
    const data: DataDefinition = {
      mutations: {
        addItem: {
          items: "$append(context.items, { name: event.name, meta: { created: $now() } })",
        },
      },
    };

    const compiled = compileData(data);

    expect(
      compiled.compiled.expressions.has(
        "$append(context.items, { name: event.name, meta: { created: $now() } })"
      )
    ).toBe(true);
  });
});
