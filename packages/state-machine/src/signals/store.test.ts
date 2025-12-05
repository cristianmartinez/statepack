import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals-core";
import { createSignalStore } from "./store";

describe("SignalStore", () => {
  describe("creation", () => {
    test("creates store with initial state and context", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0, name: "test" },
      });

      expect(store.state.value).toBe("idle");
      expect(store.context.count.value).toBe(0);
      expect(store.context.name.value).toBe("test");
      expect(store.done.value).toBe(false);
      expect(store.lastEvent.value).toBeUndefined();
    });

    test("each context field is independent signal", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { a: 1, b: 2 },
      });

      // Verify they're different signal instances
      expect(store.context.a).not.toBe(store.context.b);
      expect(store.context.a.value).toBe(1);
      expect(store.context.b.value).toBe(2);
    });

    test("handles nested state values", () => {
      const store = createSignalStore({
        initial: { parent: "child" },
        context: { count: 0 },
      });

      expect(store.state.value).toEqual({ parent: "child" });
    });

    test("handles complex context values", () => {
      const store = createSignalStore({
        initial: "idle",
        context: {
          user: { name: "Alice", email: "alice@example.com" },
          todos: [{ id: 1, text: "Test" }],
        },
      });

      expect(store.context.user.value).toEqual({
        name: "Alice",
        email: "alice@example.com",
      });
      expect(store.context.todos.value).toEqual([{ id: 1, text: "Test" }]);
    });

    test("handles empty context", () => {
      const store = createSignalStore({
        initial: "idle",
        context: {},
      });

      expect(store.getSnapshot().context).toEqual({});
    });
  });

  describe("updates", () => {
    test("updating one context field does not notify others", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0, name: "test" },
      });

      let countUpdates = 0;
      let nameUpdates = 0;

      // Subscribe to each field
      const disposeCount = effect(() => {
        store.context.count.value;
        countUpdates++;
      });
      const disposeName = effect(() => {
        store.context.name.value;
        nameUpdates++;
      });

      // Reset after initial effect run
      countUpdates = 0;
      nameUpdates = 0;

      // Update only count
      store.context.count.value = 1;

      expect(countUpdates).toBe(1);
      expect(nameUpdates).toBe(0);

      // Cleanup
      disposeCount();
      disposeName();
    });

    test("state signal updates independently from context", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      let stateUpdates = 0;
      let contextUpdates = 0;

      const disposeState = effect(() => {
        store.state.value;
        stateUpdates++;
      });
      const disposeContext = effect(() => {
        store.context.count.value;
        contextUpdates++;
      });

      // Reset after initial run
      stateUpdates = 0;
      contextUpdates = 0;

      // Update state
      store.state.value = "running";

      expect(stateUpdates).toBe(1);
      expect(contextUpdates).toBe(0);

      // Cleanup
      disposeState();
      disposeContext();
    });

    test("done signal updates independently", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      let doneUpdates = 0;
      let stateUpdates = 0;

      const disposeDone = effect(() => {
        store.done.value;
        doneUpdates++;
      });
      const disposeState = effect(() => {
        store.state.value;
        stateUpdates++;
      });

      // Reset
      doneUpdates = 0;
      stateUpdates = 0;

      // Update done
      store.done.value = true;

      expect(doneUpdates).toBe(1);
      expect(stateUpdates).toBe(0);

      // Cleanup
      disposeDone();
      disposeState();
    });

    test("lastEvent signal updates independently", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      let eventUpdates = 0;

      const dispose = effect(() => {
        store.lastEvent.value;
        eventUpdates++;
      });

      eventUpdates = 0;

      store.lastEvent.value = { type: "INCREMENT" };

      expect(eventUpdates).toBe(1);
      expect(store.lastEvent.value).toEqual({ type: "INCREMENT" });

      dispose();
    });
  });

  describe("batch", () => {
    test("batch groups multiple updates into single notification", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { a: 0, b: 0 },
      });

      let updateCount = 0;

      const dispose = effect(() => {
        store.context.a.value;
        store.context.b.value;
        updateCount++;
      });

      // Reset after initial run
      updateCount = 0;

      // Batch multiple updates
      store.batch(() => {
        store.context.a.value = 1;
        store.context.b.value = 2;
      });

      // Should only trigger one update, not two
      expect(updateCount).toBe(1);
      expect(store.context.a.value).toBe(1);
      expect(store.context.b.value).toBe(2);

      dispose();
    });

    test("batch works with state and context updates together", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      let updateCount = 0;

      const dispose = effect(() => {
        store.state.value;
        store.context.count.value;
        updateCount++;
      });

      updateCount = 0;

      store.batch(() => {
        store.state.value = "running";
        store.context.count.value = 5;
      });

      expect(updateCount).toBe(1);
      expect(store.state.value).toBe("running");
      expect(store.context.count.value).toBe(5);

      dispose();
    });
  });

  describe("snapshot", () => {
    test("returns plain object snapshot", () => {
      const store = createSignalStore({
        initial: "running",
        context: { count: 5, name: "test" },
      });

      store.done.value = true;
      store.lastEvent.value = { type: "COMPLETE" };

      const snapshot = store.getSnapshot();

      expect(snapshot).toEqual({
        value: "running",
        context: { count: 5, name: "test" },
        done: true,
        event: { type: "COMPLETE" },
      });
    });

    test("snapshot reflects current signal values", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      expect(store.getSnapshot().context.count).toBe(0);

      store.context.count.value = 10;

      expect(store.getSnapshot().context.count).toBe(10);
    });

    test("snapshot is not reactive (plain object)", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      const snapshot = store.getSnapshot();

      // Modifying snapshot doesn't affect store
      snapshot.context.count = 999;

      expect(store.context.count.value).toBe(0);
    });
  });

  describe("dispose", () => {
    test("dispose can be called without error", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      // Should not throw
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe("edge cases", () => {
    test("handles null and undefined context values", () => {
      const store = createSignalStore({
        initial: "idle",
        context: {
          nullValue: null,
          undefinedValue: undefined,
        },
      });

      expect(store.context.nullValue.value).toBeNull();
      expect(store.context.undefinedValue.value).toBeUndefined();
    });

    test("handles array context values", () => {
      const store = createSignalStore({
        initial: "idle",
        context: {
          items: [1, 2, 3],
        },
      });

      expect(store.context.items.value).toEqual([1, 2, 3]);

      // Update array
      store.context.items.value = [4, 5, 6];
      expect(store.context.items.value).toEqual([4, 5, 6]);
    });

    test("signal equality check prevents unnecessary updates", () => {
      const store = createSignalStore({
        initial: "idle",
        context: { count: 0 },
      });

      let updateCount = 0;

      const dispose = effect(() => {
        store.context.count.value;
        updateCount++;
      });

      updateCount = 0;

      // Set to same value - should NOT trigger update
      store.context.count.value = 0;

      expect(updateCount).toBe(0);

      dispose();
    });

    test("object equality does trigger update (reference comparison)", () => {
      const store = createSignalStore({
        initial: "idle",
        context: {
          user: { name: "Alice" },
        },
      });

      let updateCount = 0;

      const dispose = effect(() => {
        store.context.user.value;
        updateCount++;
      });

      updateCount = 0;

      // Set to new object with same content - WILL trigger update (different reference)
      store.context.user.value = { name: "Alice" };

      expect(updateCount).toBe(1);

      dispose();
    });
  });
});
