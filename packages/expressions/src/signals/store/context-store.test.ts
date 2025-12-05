import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals-core";
import { createContextStore } from "./context-store";

describe("ContextStore", () => {
  describe("createContextStore", () => {
    test("creates store with initial context", () => {
      const store = createContextStore({
        context: { count: 0, name: "test" },
      });

      expect(store.context.count.value).toBe(0);
      expect(store.context.name.value).toBe("test");
    });

    test("each context field is an independent signal", () => {
      const store = createContextStore({
        context: { a: 1, b: 2, c: 3 },
      });

      let aNotifications = 0;
      let bNotifications = 0;

      const disposeA = effect(() => {
        store.context.a.value;
        aNotifications++;
      });
      const disposeB = effect(() => {
        store.context.b.value;
        bNotifications++;
      });

      // Reset after initial effect runs
      aNotifications = 0;
      bNotifications = 0;

      // Update only 'a'
      store.context.a.value = 10;

      expect(aNotifications).toBe(1);
      expect(bNotifications).toBe(0);

      disposeA();
      disposeB();
    });

    test("updating one field doesn't notify others", () => {
      const store = createContextStore({
        context: { count: 0, name: "test" },
      });

      let countUpdates = 0;
      let nameUpdates = 0;

      const dispose1 = effect(() => {
        store.context.count.value;
        countUpdates++;
      });
      const dispose2 = effect(() => {
        store.context.name.value;
        nameUpdates++;
      });

      countUpdates = 0;
      nameUpdates = 0;

      store.context.count.value = 5;

      expect(countUpdates).toBe(1);
      expect(nameUpdates).toBe(0);

      dispose1();
      dispose2();
    });

    test("batch groups multiple updates", () => {
      const store = createContextStore({
        context: { a: 1, b: 2 },
      });

      let notifications = 0;
      const dispose = effect(() => {
        store.context.a.value;
        store.context.b.value;
        notifications++;
      });

      notifications = 0;

      store.batch(() => {
        store.context.a.value = 10;
        store.context.b.value = 20;
      });

      // Should only notify once due to batching
      expect(notifications).toBe(1);

      dispose();
    });

    test("getSnapshot returns plain values", () => {
      const store = createContextStore({
        context: { count: 5, name: "hello" },
      });

      const snapshot = store.getSnapshot();

      expect(snapshot.context).toEqual({ count: 5, name: "hello" });
      expect(typeof snapshot.context.count).toBe("number");
      expect(typeof snapshot.context.name).toBe("string");
    });

    test("handles empty context", () => {
      const store = createContextStore({
        context: {},
      });

      expect(store.getSnapshot().context).toEqual({});
    });

    test("handles complex context values", () => {
      const store = createContextStore({
        context: {
          user: { name: "Alice", age: 30 },
          items: [1, 2, 3],
          active: true,
        },
      });

      expect(store.context.user.value).toEqual({ name: "Alice", age: 30 });
      expect(store.context.items.value).toEqual([1, 2, 3]);
      expect(store.context.active.value).toBe(true);
    });

    test("handles null and undefined context values", () => {
      const store = createContextStore({
        context: {
          nullValue: null as null | string,
          undefinedValue: undefined as undefined | number,
        },
      });

      expect(store.context.nullValue.value).toBeNull();
      expect(store.context.undefinedValue.value).toBeUndefined();
    });

    test("handles array context values", () => {
      const store = createContextStore({
        context: { items: [1, 2, 3] },
      });

      expect(store.context.items.value).toEqual([1, 2, 3]);

      store.context.items.value = [4, 5, 6];
      expect(store.context.items.value).toEqual([4, 5, 6]);
    });

    test("signal equality prevents unnecessary updates", () => {
      const store = createContextStore({
        context: { count: 5 },
      });

      let updates = 0;
      const dispose = effect(() => {
        store.context.count.value;
        updates++;
      });

      updates = 0;

      // Setting same value shouldn't trigger update
      store.context.count.value = 5;
      expect(updates).toBe(0);

      // Setting different value should trigger
      store.context.count.value = 10;
      expect(updates).toBe(1);

      dispose();
    });

    test("object reference changes trigger updates", () => {
      const store = createContextStore({
        context: { user: { name: "Alice" } },
      });

      let updates = 0;
      const dispose = effect(() => {
        store.context.user.value;
        updates++;
      });

      updates = 0;

      // New object reference triggers update
      store.context.user.value = { name: "Alice" };
      expect(updates).toBe(1);

      dispose();
    });

    test("dispose is callable", () => {
      const store = createContextStore({
        context: { count: 0 },
      });

      expect(() => store.dispose()).not.toThrow();
    });
  });
});
