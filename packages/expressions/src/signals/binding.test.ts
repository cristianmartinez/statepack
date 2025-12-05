import { describe, expect, test } from "bun:test";
import { signal, effect } from "@preact/signals-core";
import { createBinding, createBindingFromCompiled, disposeBindings } from "./binding";
import { compileExpression } from "../evaluate";
import type { SignalScope } from "./types";

// Helper to wait for async evaluation
const waitFor = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to create a signal scope
function createSignalScope<T extends Record<string, unknown>>(
  context: T
): SignalScope<T> {
  const signalContext = {} as SignalScope<T>["context"];
  for (const [key, value] of Object.entries(context)) {
    (signalContext as Record<string, { value: unknown }>)[key] = signal(value);
  }
  return { context: signalContext };
}

describe("Signal Bindings", () => {
  describe("createBinding", () => {
    test("computes value from context signal", async () => {
      const scope = createSignalScope({ count: 5 });
      const binding = createBinding("context.count * 2", scope);

      await waitFor();

      expect(binding.value.value).toBe(10);
      expect(binding.loading.value).toBe(false);
      expect(binding.error.value).toBeUndefined();

      binding.dispose();
    });

    test("recomputes when dependency changes", async () => {
      const scope = createSignalScope({ count: 5 });
      const binding = createBinding("context.count * 2", scope);

      await waitFor();
      expect(binding.value.value).toBe(10);

      // Change the dependency
      (scope.context.count as { value: number }).value = 10;

      await waitFor();
      expect(binding.value.value).toBe(20);

      binding.dispose();
    });

    test("handles string concatenation", async () => {
      const scope = createSignalScope({ name: "Alice" });
      const binding = createBinding("'Hello, ' & context.name", scope);

      await waitFor();

      expect(binding.value.value).toBe("Hello, Alice");

      (scope.context.name as { value: string }).value = "Bob";
      await waitFor();

      expect(binding.value.value).toBe("Hello, Bob");

      binding.dispose();
    });

    test("handles array expressions", async () => {
      const scope = createSignalScope({ items: [1, 2, 3, 4, 5] });
      const binding = createBinding("$sum(context.items)", scope);

      await waitFor();

      expect(binding.value.value).toBe(15);

      (scope.context.items as { value: number[] }).value = [10, 20, 30];
      await waitFor();

      expect(binding.value.value).toBe(60);

      binding.dispose();
    });

    test("throws on invalid expression at compile time", () => {
      const scope = createSignalScope({ count: 5 });
      expect(() => createBinding("context.count *** 2", scope)).toThrow();
    });

    test("sets error on runtime evaluation error", async () => {
      const scope = createSignalScope({ count: 5 });
      const binding = createBinding("context.nonexistent()", scope);

      await waitFor();

      expect(binding.error.value).toBeDefined();
      expect(binding.loading.value).toBe(false);

      binding.dispose();
    });

    test("loading state transitions correctly", async () => {
      const scope = createSignalScope({ count: 5 });
      const binding = createBinding("context.count * 2", scope);

      // Initially loading
      expect(binding.loading.value).toBe(true);

      await waitFor();

      // Done loading
      expect(binding.loading.value).toBe(false);

      binding.dispose();
    });

    test("calls onChange callback when value changes", async () => {
      const scope = createSignalScope({ count: 5 });
      const values: unknown[] = [];

      const binding = createBinding("context.count * 2", scope, {
        onChange: (value) => values.push(value),
      });

      await waitFor();

      expect(values).toContain(10);

      (scope.context.count as { value: number }).value = 7;
      await waitFor();

      expect(values).toContain(14);

      binding.dispose();
    });

    test("calls onError callback on evaluation error", async () => {
      const scope = createSignalScope({ count: 5 });
      const errors: Error[] = [];

      const binding = createBinding("context.nonexistent()", scope, {
        onError: (err) => errors.push(err),
      });

      await waitFor();

      expect(errors.length).toBeGreaterThan(0);

      binding.dispose();
    });

    test("handles null context values", async () => {
      const scope = createSignalScope({ value: null as null | number });
      const binding = createBinding("context.value", scope);

      await waitFor();

      expect(binding.value.value).toBeNull();

      binding.dispose();
    });

    test("handles undefined context values", async () => {
      const scope = createSignalScope({ value: undefined as undefined | number });
      const binding = createBinding("context.value", scope);

      await waitFor();

      expect(binding.value.value).toBeUndefined();

      binding.dispose();
    });

    test("handles boolean expressions", async () => {
      const scope = createSignalScope({ count: 5 });
      const binding = createBinding("context.count > 3", scope);

      await waitFor();

      expect(binding.value.value).toBe(true);

      (scope.context.count as { value: number }).value = 2;
      await waitFor();

      expect(binding.value.value).toBe(false);

      binding.dispose();
    });

    test("handles conditional expressions", async () => {
      const scope = createSignalScope({ count: 5 });
      const binding = createBinding("context.count > 3 ? 'high' : 'low'", scope);

      await waitFor();

      expect(binding.value.value).toBe("high");

      (scope.context.count as { value: number }).value = 2;
      await waitFor();

      expect(binding.value.value).toBe("low");

      binding.dispose();
    });
  });

  describe("createBindingFromCompiled", () => {
    test("works with pre-compiled expression", async () => {
      const scope = createSignalScope({ count: 5 });
      const compiled = compileExpression("context.count * 2");
      const binding = createBindingFromCompiled(compiled, scope);

      await waitFor();

      expect(binding.value.value).toBe(10);

      binding.dispose();
    });
  });

  describe("disposeBindings", () => {
    test("disposes multiple bindings", async () => {
      const scope = createSignalScope({ a: 1, b: 2 });
      const bindings = [
        createBinding("context.a * 10", scope),
        createBinding("context.b * 10", scope),
      ];

      await waitFor();

      expect(() => disposeBindings(bindings)).not.toThrow();
    });
  });

  describe("selector dependencies", () => {
    test("binding can depend on selectors", async () => {
      const scope = createSignalScope({ count: 5 });

      // Create a "selector" (simulated)
      const doubledSignal = signal<unknown>(undefined);

      // First binding
      const doubledBinding = createBinding("context.count * 2", scope);
      await waitFor();

      // Manually sync the doubled value to a signal
      doubledSignal.value = doubledBinding.value.value;

      // Add selector to scope
      const scopeWithSelectors: SignalScope<{ count: number }> = {
        ...scope,
        selectors: {
          doubled: { value: doubledSignal },
        },
      };

      // Second binding that depends on selector
      const quadrupledBinding = createBinding("selectors.doubled * 2", scopeWithSelectors);
      await waitFor();

      expect(quadrupledBinding.value.value).toBe(20);

      doubledBinding.dispose();
      quadrupledBinding.dispose();
    });
  });
});
