import { describe, expect, it, beforeEach } from "bun:test";
import { compileStore, type CompiledStore } from "./index";
import {
  createStoreInstance,
  getSliceContext,
  updateSliceContext,
  resolveScope,
  buildScope,
  evaluateSliceQuery,
  executeSliceMutation,
  type StoreInstance,
} from "./runtime";
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

describe("Store Instance", () => {
  it("creates an instance with initialized contexts", () => {
    const store: StoreDefinition = {
      todos: { context: { items: [] } },
      settings: { context: { theme: "dark" } },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    expect(instance.contexts.size).toBe(2);
    expect(getSliceContext(instance, "todos")).toEqual({ items: [] });
    expect(getSliceContext(instance, "settings")).toEqual({ theme: "dark" });
  });

  it("updates slice context", () => {
    const store: StoreDefinition = {
      counter: { context: { count: 0 } },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    updateSliceContext(instance, "counter", { count: 5 });
    expect(getSliceContext(instance, "counter")).toEqual({ count: 5 });
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

    const parentInstance = createStoreInstance(parentCompiled);
    const childInstance = createStoreInstance(childCompiled, { parent: parentInstance });

    expect(childInstance.parent).toBe(parentInstance);
    expect(childInstance.root).toBe(parentInstance);
  });

  it("sets root correctly in deep hierarchy", () => {
    const rootStore: StoreDefinition = { root: { context: { level: 0 } } };
    const midStore: StoreDefinition = { mid: { context: { level: 1 } } };
    const leafStore: StoreDefinition = { leaf: { context: { level: 2 } } };

    const rootInstance = createStoreInstance(compileStore(rootStore));
    const midInstance = createStoreInstance(compileStore(midStore), { parent: rootInstance });
    const leafInstance = createStoreInstance(compileStore(leafStore), { parent: midInstance });

    expect(leafInstance.root).toBe(rootInstance);
    expect(midInstance.root).toBe(rootInstance);
    expect(rootInstance.root).toBe(rootInstance);
  });
});

describe("Scope Resolution", () => {
  let rootInstance: StoreInstance;
  let childInstance: StoreInstance;
  let namedStores: Map<string, StoreInstance>;

  beforeEach(() => {
    const rootStore: StoreDefinition = {
      user: { context: { name: "alice" } },
      settings: { context: { theme: "dark" } },
    };
    const childStore: StoreDefinition = {
      todos: { context: { items: [] } },
    };
    const cartStore: StoreDefinition = {
      cart: { context: { items: [] } },
    };

    rootInstance = createStoreInstance(compileStore(rootStore));
    childInstance = createStoreInstance(compileStore(childStore), { parent: rootInstance });

    namedStores = new Map();
    namedStores.set("cart", createStoreInstance(compileStore(cartStore)));
  });

  it("resolves $context.sliceName", () => {
    const resolved = resolveScope(childInstance, "$context.todos.items");
    expect(resolved).toBeDefined();
    expect(resolved!.store).toBe(childInstance);
    expect(resolved!.sliceName).toBe("todos");
    expect(resolved!.path).toEqual(["items"]);
  });

  it("resolves $context for single-slice store", () => {
    const resolved = resolveScope(childInstance, "$context.items");
    expect(resolved).toBeDefined();
    expect(resolved!.sliceName).toBe("todos");
    expect(resolved!.path).toEqual(["items"]);
  });

  it("resolves $parent.sliceName", () => {
    const resolved = resolveScope(childInstance, "$parent.user.name");
    expect(resolved).toBeDefined();
    expect(resolved!.store).toBe(rootInstance);
    expect(resolved!.sliceName).toBe("user");
    expect(resolved!.path).toEqual(["name"]);
  });

  it("resolves $root.sliceName", () => {
    const resolved = resolveScope(childInstance, "$root.settings.theme");
    expect(resolved).toBeDefined();
    expect(resolved!.store).toBe(rootInstance);
    expect(resolved!.sliceName).toBe("settings");
    expect(resolved!.path).toEqual(["theme"]);
  });

  it("resolves $[name] for named stores", () => {
    const resolved = resolveScope(childInstance, "$cart.items", namedStores);
    expect(resolved).toBeDefined();
    expect(resolved!.sliceName).toBe("cart");
    expect(resolved!.path).toEqual(["items"]);
  });

  it("returns undefined for non-existent slice in multi-slice store", () => {
    // rootInstance has multiple slices (user, settings)
    const resolved = resolveScope(rootInstance, "$context.nonexistent.path");
    expect(resolved).toBeUndefined();
  });

  it("returns undefined for $parent when no parent exists", () => {
    const resolved = resolveScope(rootInstance, "$parent.user.name");
    expect(resolved).toBeUndefined();
  });
});

describe("Build Scope", () => {
  it("includes context and event", () => {
    const store: StoreDefinition = {
      todos: { context: { items: ["a", "b"] } },
    };
    const instance = createStoreInstance(compileStore(store));

    const scope = buildScope(instance, "todos", { type: "ADD", item: "c" });

    expect(scope.context).toEqual({ items: ["a", "b"] });
    expect(scope.event).toEqual({ type: "ADD", item: "c" });
  });

  it("includes $context with all slices", () => {
    const store: StoreDefinition = {
      todos: { context: { items: [] } },
      settings: { context: { theme: "light" } },
    };
    const instance = createStoreInstance(compileStore(store));

    const scope = buildScope(instance, "todos");

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

    const parentInstance = createStoreInstance(compileStore(parentStore));
    const childInstance = createStoreInstance(compileStore(childStore), { parent: parentInstance });

    const scope = buildScope(childInstance, "screen");

    expect(scope.$parent).toEqual({ app: { user: "alice" } });
  });

  it("includes $root", () => {
    const rootStore: StoreDefinition = { root: { context: { global: true } } };
    const childStore: StoreDefinition = { child: { context: { local: true } } };

    const rootInstance = createStoreInstance(compileStore(rootStore));
    const childInstance = createStoreInstance(compileStore(childStore), { parent: rootInstance });

    const scope = buildScope(childInstance, "child");

    expect(scope.$root).toEqual({ root: { global: true } });
  });

  it("includes named stores with $ prefix", () => {
    const store: StoreDefinition = { main: { context: {} } };
    const cartStore: StoreDefinition = { cart: { context: { items: [1, 2, 3] } } };

    const instance = createStoreInstance(compileStore(store));
    const namedStores = new Map<string, StoreInstance>();
    namedStores.set("cart", createStoreInstance(compileStore(cartStore)));

    const scope = buildScope(instance, "main", undefined, namedStores);

    expect(scope.$cart).toEqual({ items: [1, 2, 3] });
  });
});

describe("Evaluate Slice Query", () => {
  it("evaluates a simple query", async () => {
    const store: StoreDefinition = {
      counter: {
        context: { count: 5 },
        queries: { doubled: "context.count * 2" },
      },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    const result = await evaluateSliceQuery<number>(instance, "counter", "doubled");
    expect(result).toBe(10);
  });

  it("evaluates query with event", async () => {
    const store: StoreDefinition = {
      math: {
        context: { base: 10 },
        queries: { sum: "context.base + event.value" },
      },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    const result = await evaluateSliceQuery<number>(instance, "math", "sum", { value: 5 });
    expect(result).toBe(15);
  });

  it("throws for non-existent query", async () => {
    const store: StoreDefinition = {
      test: { context: {}, queries: {} },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    await expect(evaluateSliceQuery(instance, "test", "missing")).rejects.toThrow(
      "Query not found"
    );
  });
});

describe("Execute Slice Mutation", () => {
  it("executes a simple mutation", async () => {
    const store: StoreDefinition = {
      counter: {
        context: { count: 0 },
        mutations: { increment: { count: "context.count + 1" } },
      },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    await executeSliceMutation(instance, "counter", "increment");

    expect(getSliceContext(instance, "counter")).toEqual({ count: 1 });
  });

  it("executes mutation with event payload", async () => {
    const store: StoreDefinition = {
      counter: {
        context: { count: 0 },
        mutations: { add: { count: "context.count + event.amount" } },
      },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    await executeSliceMutation(instance, "counter", "add", { amount: 10 });

    expect(getSliceContext(instance, "counter")).toEqual({ count: 10 });
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
    const instance = createStoreInstance(compiled);

    await executeSliceMutation(instance, "form", "setUser", {
      name: "Alice",
      email: "alice@example.com",
    });

    expect(getSliceContext(instance, "form")).toEqual({
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("throws for non-existent mutation", async () => {
    const store: StoreDefinition = {
      test: { context: {}, mutations: {} },
    };

    const compiled = compileStore(store);
    const instance = createStoreInstance(compiled);

    await expect(executeSliceMutation(instance, "test", "missing")).rejects.toThrow(
      "Mutation not found"
    );
  });
});

describe("Cross-Scope Queries", () => {
  it("can query parent context", async () => {
    const parentStore: StoreDefinition = {
      app: { context: { multiplier: 2 } },
    };
    const childStore: StoreDefinition = {
      counter: {
        context: { value: 5 },
        queries: { scaled: "context.value * $parent.app.multiplier" },
      },
    };

    const parentInstance = createStoreInstance(compileStore(parentStore));
    const childInstance = createStoreInstance(compileStore(childStore), { parent: parentInstance });

    const result = await evaluateSliceQuery<number>(childInstance, "counter", "scaled");
    expect(result).toBe(10);
  });

  it("can query root context", async () => {
    const rootStore: StoreDefinition = {
      config: { context: { taxRate: 0.1 } },
    };
    const midStore: StoreDefinition = {
      mid: { context: {} },
    };
    const leafStore: StoreDefinition = {
      cart: {
        context: { subtotal: 100 },
        queries: { total: "context.subtotal * (1 + $root.config.taxRate)" },
      },
    };

    const rootInstance = createStoreInstance(compileStore(rootStore));
    const midInstance = createStoreInstance(compileStore(midStore), { parent: rootInstance });
    const leafInstance = createStoreInstance(compileStore(leafStore), { parent: midInstance });

    const result = await evaluateSliceQuery<number>(leafInstance, "cart", "total");
    expect(result).toBeCloseTo(110);
  });

  it("can query named stores", async () => {
    const mainStore: StoreDefinition = {
      checkout: {
        context: {},
        queries: { cartCount: "$count($cart.items)" },
      },
    };
    const cartStore: StoreDefinition = {
      cart: { context: { items: ["a", "b", "c"] } },
    };

    const mainInstance = createStoreInstance(compileStore(mainStore));
    const namedStores = new Map<string, StoreInstance>();
    namedStores.set("cart", createStoreInstance(compileStore(cartStore)));

    const result = await evaluateSliceQuery<number>(
      mainInstance,
      "checkout",
      "cartCount",
      undefined,
      namedStores
    );
    expect(result).toBe(3);
  });
});
