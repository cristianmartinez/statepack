import { describe, expect, test } from "bun:test";
import { compileData, type DataDefinition } from "../compiler";
import { evaluateQuery, executeMutation } from "./index";

describe("evaluateQuery", () => {
  test("filters completed todos", async () => {
    const data: DataDefinition = {
      queries: {
        completedTodos: "$filter(context.todos, function($t) { $t.completed })",
      },
    };

    const compiled = compileData(data);
    const result = await evaluateQuery(compiled, "completedTodos", {
      context: {
        todos: [
          { id: 1, text: "Task 1", completed: true },
          { id: 2, text: "Task 2", completed: false },
          { id: 3, text: "Task 3", completed: true },
        ],
      },
    });

    expect(result).toEqual([
      { id: 1, text: "Task 1", completed: true },
      { id: 3, text: "Task 3", completed: true },
    ]);
  });

  test("counts todos", async () => {
    const data: DataDefinition = {
      queries: {
        todoCount: "$count(context.todos)",
      },
    };

    const compiled = compileData(data);
    const result = await evaluateQuery(compiled, "todoCount", {
      context: {
        todos: [{ id: 1 }, { id: 2 }, { id: 3 }],
      },
    });

    expect(result).toBe(3);
  });

  test("throws on unknown query", async () => {
    const data: DataDefinition = {
      queries: {
        existing: "context.value",
      },
    };

    const compiled = compileData(data);

    await expect(evaluateQuery(compiled, "nonexistent", { context: {} })).rejects.toThrow(
      "Query not found: nonexistent"
    );
  });
});

describe("executeMutation", () => {
  test("appends todo to list", async () => {
    const data: DataDefinition = {
      mutations: {
        addTodo: {
          todos: "$append(context.todos, [{ 'text': event.text, 'completed': false }])",
        },
      },
    };

    const compiled = compileData(data);
    const result = await executeMutation(compiled, "addTodo", {
      context: {
        todos: [{ text: "Existing", completed: true }],
      },
      event: { text: "New todo" },
    });

    expect(result.todos).toEqual([
      { text: "Existing", completed: true },
      { text: "New todo", completed: false },
    ]);
  });

  test("deletes todo by id", async () => {
    const data: DataDefinition = {
      mutations: {
        deleteTodo: {
          todos: "$filter(context.todos, function($t) { $t.id != event.id })",
        },
      },
    };

    const compiled = compileData(data);
    const result = await executeMutation(compiled, "deleteTodo", {
      context: {
        todos: [
          { id: 1, text: "Task 1" },
          { id: 2, text: "Task 2" },
          { id: 3, text: "Task 3" },
        ],
      },
      event: { id: 2 },
    });

    expect(result.todos).toEqual([
      { id: 1, text: "Task 1" },
      { id: 3, text: "Task 3" },
    ]);
  });

  test("updates multiple context keys", async () => {
    const data: DataDefinition = {
      mutations: {
        addTodo: {
          todos: "$append(context.todos, [{ 'text': event.text }])",
          input: "''",
        },
      },
    };

    const compiled = compileData(data);
    const result = await executeMutation(compiled, "addTodo", {
      context: {
        todos: [],
        input: "some text",
      },
      event: { text: "New todo" },
    });

    expect(result.todos).toEqual([{ text: "New todo" }]);
    expect(result.input).toBe("");
  });

  test("throws on unknown mutation", async () => {
    const data: DataDefinition = {
      mutations: {
        existing: { value: "'test'" },
      },
    };

    const compiled = compileData(data);

    await expect(executeMutation(compiled, "nonexistent", { context: {} })).rejects.toThrow(
      "Mutation not found: nonexistent"
    );
  });
});
