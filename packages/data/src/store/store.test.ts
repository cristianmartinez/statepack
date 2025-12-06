import { describe, expect, it } from "bun:test";
import { compileStore } from "./index";
import {
  createSignalStoreInstance,
  getSignalContextSnapshot,
  updateSignalContext,
  buildPlainScope,
  executeSignalMutation,
  type SignalStoreInstance,
} from "./signal-runtime";
import type { StoreDefinition } from "../schema";

describe("Store Compiler", () => {
  it("compiles a store with multiple slices", () => {
    const store: StoreDefinition = {
      todos: {
        context: { items: [], filter: "all" },
        queries: {
          count: "$count(context.items)",
          filtered: 'context.items[filter = "all" or completed = (filter = "completed")]',
        },
        mutations: {
          addTodo: { items: "$append(context.items, event.todo)" },
        },
      },
      settings: {
        context: { theme: "light" },
        mutations: {
          toggleTheme: { theme: 'context.theme = "light" ? "dark" : "light"' },
        },
      },
    };

    const compiled = compileStore(store);

    expect(compiled.slices.size).toBe(2);
    expect(compiled.slices.has("todos")).toBe(true);
    expect(compiled.slices.has("settings")).toBe(true);

    const todosSlice = compiled.slices.get("todos")!;
    expect(todosSlice.definition.context).toEqual({ items: [], filter: "all" });
    expect(todosSlice.expressions.size).toBeGreaterThan(0);
  });

  it("compiles expressions in queries and mutations", () => {
    const store: StoreDefinition = {
      counter: {
        context: { count: 0 },
        queries: {
          doubled: "context.count * 2",
        },
        mutations: {
          increment: { count: "context.count + 1" },
        },
      },
    };

    const compiled = compileStore(store);
    const slice = compiled.slices.get("counter")!;

    expect(slice.expressions.has("context.count * 2")).toBe(true);
    expect(slice.expressions.has("context.count + 1")).toBe(true);
  });
});

describe("Signal Store Instance", () => {
  it("creates an instance with initialized contexts", () => {
    const store: StoreDefinition = {
      todos: { context: { items: [] } },
      settings: { context: { theme: "dark" } },
    };

    const compiled = compileStore(store);
    const instance = createSignalStoreInstance(compiled);

    expect(instance.contexts.size).toBe(2);
    expect(getSignalContextSnapshot(instance, "todos")).toEqual({ items: [] });
    expect(getSignalContextSnapshot(instance, "settings")).toEqual({ theme: "dark" });
  });

  it("updates slice context", () => {
    const store: StoreDefinition = {
      counter: { context: { count: 0 } },
    };

    const compiled = compileStore(store);
    const instance = createSignalStoreInstance(compiled);

    updateSignalContext(instance, "counter", { count: 5 });
    expect(getSignalContextSnapshot(instance, "counter")).toEqual({ count: 5 });
  });

  it("creates parent-child hierarchy", () => {
    const parentStore: StoreDefinition = {
      app: { context: { user: "alice" } },
    };
    const childStore: StoreDefinition = {
      screen: { context: { items: [] } },
    };

    const parentCompiled = compileStore(parentStore);
    const childCompiled = compileStore(childStore);

    const parentInstance = createSignalStoreInstance(parentCompiled);
    const childInstance = createSignalStoreInstance(childCompiled, { parent: parentInstance });

    expect(childInstance.parent).toBe(parentInstance);
    expect(childInstance.root).toBe(parentInstance);
  });

  it("sets root correctly in deep hierarchy", () => {
    const rootStore: StoreDefinition = { root: { context: { level: 0 } } };
    const midStore: StoreDefinition = { mid: { context: { level: 1 } } };
    const leafStore: StoreDefinition = { leaf: { context: { level: 2 } } };

    const rootInstance = createSignalStoreInstance(compileStore(rootStore));
    const midInstance = createSignalStoreInstance(compileStore(midStore), { parent: rootInstance });
    const leafInstance = createSignalStoreInstance(compileStore(leafStore), { parent: midInstance });

    expect(leafInstance.root).toBe(rootInstance);
    expect(midInstance.root).toBe(rootInstance);
    expect(rootInstance.root).toBe(rootInstance);
  });
});

describe("Build Plain Scope", () => {
  it("includes context and event", () => {
    const store: StoreDefinition = {
      todos: { context: { items: ["a", "b"] } },
    };
    const instance = createSignalStoreInstance(compileStore(store));

    const scope = buildPlainScope(instance, "todos", { type: "ADD", item: "c" });

    expect(scope.context).toEqual({ items: ["a", "b"] });
    expect(scope.event).toEqual({ type: "ADD", item: "c" });
  });

  it("includes $context with all slices", () => {
    const store: StoreDefinition = {
      todos: { context: { items: [] } },
      settings: { context: { theme: "light" } },
    };
    const instance = createSignalStoreInstance(compileStore(store));

    const scope = buildPlainScope(instance, "todos");

    expect(scope.$context).toEqual({
      todos: { items: [] },
      settings: { theme: "light" },
    });
  });

  it("includes $parent when parent exists", () => {
    const parentStore: StoreDefinition = {
      app: { context: { user: "alice" } },
    };
    const childStore: StoreDefinition = {
      screen: { context: { data: [] } },
    };

    const parentInstance = createSignalStoreInstance(compileStore(parentStore));
    const childInstance = createSignalStoreInstance(compileStore(childStore), {
      parent: parentInstance,
    });

    const scope = buildPlainScope(childInstance, "screen");

    expect(scope.$parent).toEqual({ app: { user: "alice" } });
  });

  it("includes $root", () => {
    const rootStore: StoreDefinition = { root: { context: { global: true } } };
    const childStore: StoreDefinition = { child: { context: { local: true } } };

    const rootInstance = createSignalStoreInstance(compileStore(rootStore));
    const childInstance = createSignalStoreInstance(compileStore(childStore), {
      parent: rootInstance,
    });

    const scope = buildPlainScope(childInstance, "child");

    expect(scope.$root).toEqual({ root: { global: true } });
  });

  it("includes named stores with $ prefix", () => {
    const store: StoreDefinition = { main: { context: {} } };
    const cartStore: StoreDefinition = { cart: { context: { items: [1, 2, 3] } } };

    const instance = createSignalStoreInstance(compileStore(store));
    const namedStores = new Map<string, SignalStoreInstance>();
    namedStores.set("cart", createSignalStoreInstance(compileStore(cartStore)));

    const scope = buildPlainScope(instance, "main", undefined, namedStores);

    expect(scope.$cart).toEqual({ items: [1, 2, 3] });
  });
});

describe("Execute Signal Mutation", () => {
  it("executes a simple mutation", async () => {
    const store: StoreDefinition = {
      counter: {
        context: { count: 0 },
        mutations: { increment: { count: "context.count + 1" } },
      },
    };

    const compiled = compileStore(store);
    const instance = createSignalStoreInstance(compiled);

    await executeSignalMutation(instance, "counter", "increment");

    expect(getSignalContextSnapshot(instance, "counter")).toEqual({ count: 1 });
  });

  it("executes mutation with event payload", async () => {
    const store: StoreDefinition = {
      counter: {
        context: { count: 0 },
        mutations: { add: { count: "context.count + event.amount" } },
      },
    };

    const compiled = compileStore(store);
    const instance = createSignalStoreInstance(compiled);

    await executeSignalMutation(instance, "counter", "add", { amount: 10 });

    expect(getSignalContextSnapshot(instance, "counter")).toEqual({ count: 10 });
  });

  it("can mutate multiple context keys", async () => {
    const store: StoreDefinition = {
      form: {
        context: { name: "", email: "" },
        mutations: {
          setUser: {
            name: "event.name",
            email: "event.email",
          },
        },
      },
    };

    const compiled = compileStore(store);
    const instance = createSignalStoreInstance(compiled);

    await executeSignalMutation(instance, "form", "setUser", {
      name: "Alice",
      email: "alice@example.com",
    });

    expect(getSignalContextSnapshot(instance, "form")).toEqual({
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("throws for non-existent mutation", async () => {
    const store: StoreDefinition = {
      test: { context: {}, mutations: {} },
    };

    const compiled = compileStore(store);
    const instance = createSignalStoreInstance(compiled);

    await expect(executeSignalMutation(instance, "test", "missing")).rejects.toThrow(
      "Mutation not found"
    );
  });
});
