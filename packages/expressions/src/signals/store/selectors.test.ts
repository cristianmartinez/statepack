import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals-core";
import { createContextStore } from "./context-store";
import { createSelector, createSelectors, disposeSelectors } from "./selectors";

// Helper to wait for async selector evaluation
const waitForSelector = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Computed Selectors", () => {
  describe("createSelector", () => {
    test("computes value from context signal", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selector = createSelector("context.count * 2", store);

      await waitForSelector();

      expect(selector.value.value).toBe(10);
      expect(selector.loading.value).toBe(false);
      expect(selector.error.value).toBeUndefined();

      selector.dispose();
    });

    test("recomputes when dependency changes", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selector = createSelector("context.count * 2", store);

      await waitForSelector();
      expect(selector.value.value).toBe(10);

      // Change the dependency
      store.context.count.value = 10;

      await waitForSelector();
      expect(selector.value.value).toBe(20);

      selector.dispose();
    });

    test("only recomputes when tracked dependencies change", async () => {
      const store = createContextStore({
        context: { count: 5, name: "test" },
      });

      const selector = createSelector("context.count * 2", store);

      await waitForSelector();

      let computeCount = 0;
      const dispose = effect(() => {
        selector.value.value;
        computeCount++;
      });

      computeCount = 0;

      // Change unrelated field
      store.context.name.value = "changed";
      await waitForSelector();

      // Should not have recomputed
      expect(computeCount).toBe(0);

      // Change tracked field
      store.context.count.value = 10;
      await waitForSelector();

      // Should have recomputed
      expect(computeCount).toBe(1);

      dispose();
      selector.dispose();
    });

    test("handles string concatenation expressions", async () => {
      const store = createContextStore({
        context: { name: "Alice" },
      });

      const selector = createSelector("'Hello, ' & context.name", store);

      await waitForSelector();

      expect(selector.value.value).toBe("Hello, Alice");

      store.context.name.value = "Bob";
      await waitForSelector();

      expect(selector.value.value).toBe("Hello, Bob");

      selector.dispose();
    });

    test("handles array expressions", async () => {
      const store = createContextStore({
        context: { items: [1, 2, 3, 4, 5] },
      });

      const selector = createSelector("$sum(context.items)", store);

      await waitForSelector();

      expect(selector.value.value).toBe(15);

      store.context.items.value = [10, 20, 30];
      await waitForSelector();

      expect(selector.value.value).toBe(60);

      selector.dispose();
    });

    test("handles complex object access", async () => {
      const store = createContextStore({
        context: {
          user: { name: "Alice", age: 30 },
        },
      });

      const selector = createSelector(
        "context.user.name & ' is ' & $string(context.user.age)",
        store
      );

      await waitForSelector();

      expect(selector.value.value).toBe("Alice is 30");

      selector.dispose();
    });

    test("throws on invalid expression at compile time", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      // Invalid JSONata syntax throws at compile time
      expect(() => createSelector("context.count *** 2", store)).toThrow();
    });

    test("sets error on runtime evaluation error", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      // Valid syntax but will fail at runtime (calling undefined as function)
      const selector = createSelector("context.nonexistent()", store);

      await waitForSelector();

      expect(selector.error.value).toBeDefined();
      expect(selector.loading.value).toBe(false);

      selector.dispose();
    });

    test("loading state transitions correctly", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selector = createSelector("context.count * 2", store);

      // Initially loading
      expect(selector.loading.value).toBe(true);

      await waitForSelector();

      // Done loading
      expect(selector.loading.value).toBe(false);

      selector.dispose();
    });
  });

  describe("createSelectors", () => {
    test("creates multiple selectors", async () => {
      const store = createContextStore({
        context: { count: 5, name: "test" },
      });

      const selectors = createSelectors({
        definitions: {
          doubled: "context.count * 2",
          greeting: "'Hello, ' & context.name",
        },
        store,
      });

      await waitForSelector();

      expect(selectors.doubled.value.value).toBe(10);
      expect(selectors.greeting.value.value).toBe("Hello, test");

      disposeSelectors(selectors);
    });

    test("selectors can depend on other selectors", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      // Create selectors in dependency order
      const selectors = createSelectors({
        definitions: {
          doubled: "context.count * 2",
        },
        store,
      });

      await waitForSelector();

      // Add a selector that depends on another
      const quadrupled = createSelector("selectors.doubled * 2", store, selectors);

      await waitForSelector();

      expect(selectors.doubled.value.value).toBe(10);
      expect(quadrupled.value.value).toBe(20);

      // Update base context
      store.context.count.value = 10;
      await waitForSelector(20); // Allow cascade

      expect(selectors.doubled.value.value).toBe(20);
      expect(quadrupled.value.value).toBe(40);

      quadrupled.dispose();
      disposeSelectors(selectors);
    });

    test("handles empty definitions", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selectors = createSelectors({
        definitions: {},
        store,
      });

      expect(Object.keys(selectors)).toHaveLength(0);
    });
  });

  describe("disposeSelectors", () => {
    test("disposes all selectors", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selectors = createSelectors({
        definitions: {
          a: "context.count + 1",
          b: "context.count + 2",
        },
        store,
      });

      await waitForSelector();

      // Should not throw
      expect(() => disposeSelectors(selectors)).not.toThrow();
    });
  });

  describe("edge cases", () => {
    test("handles null context values", async () => {
      const store = createContextStore({
        context: { value: null as null | number },
      });

      const selector = createSelector("context.value", store);

      await waitForSelector();

      expect(selector.value.value).toBeNull();

      selector.dispose();
    });

    test("handles undefined context values", async () => {
      const store = createContextStore({
        context: { value: undefined as undefined | number },
      });

      const selector = createSelector("context.value", store);

      await waitForSelector();

      expect(selector.value.value).toBeUndefined();

      selector.dispose();
    });

    test("handles boolean expressions", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selector = createSelector("context.count > 3", store);

      await waitForSelector();

      expect(selector.value.value).toBe(true);

      store.context.count.value = 2;
      await waitForSelector();

      expect(selector.value.value).toBe(false);

      selector.dispose();
    });

    test("handles conditional expressions", async () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      const selector = createSelector("context.count > 3 ? 'high' : 'low'", store);

      await waitForSelector();

      expect(selector.value.value).toBe("high");

      store.context.count.value = 2;
      await waitForSelector();

      expect(selector.value.value).toBe("low");

      selector.dispose();
    });

    test("multiple selectors update independently", async () => {
      const store = createContextStore({
        context: { a: 1, b: 2 },
      });

      const selectors = createSelectors({
        definitions: {
          sumA: "context.a * 10",
          sumB: "context.b * 10",
        },
        store,
      });

      await waitForSelector();

      let aUpdates = 0;
      let bUpdates = 0;

      const disposeA = effect(() => {
        selectors.sumA.value.value;
        aUpdates++;
      });
      const disposeB = effect(() => {
        selectors.sumB.value.value;
        bUpdates++;
      });

      aUpdates = 0;
      bUpdates = 0;

      // Update only a
      store.context.a.value = 5;
      await waitForSelector();

      expect(aUpdates).toBe(1);
      expect(bUpdates).toBe(0);

      disposeA();
      disposeB();
      disposeSelectors(selectors);
    });
  });
});
