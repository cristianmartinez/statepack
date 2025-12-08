import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { signal, effect } from "@preact/signals-core";
import { computedAsync, computedAsyncSignals } from "./index";

describe("computedAsync", () => {
  it("evaluates async function and updates value", async () => {
    const computed = computedAsync(async () => {
      return 42;
    });

    // Initially loading
    expect(computed.loading).toBe(true);
    expect(computed.value).toBe(undefined);

    // Wait for evaluation
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(computed.loading).toBe(false);
    expect(computed.value).toBe(42);
    expect(computed.error).toBe(undefined);

    computed.dispose();
  });

  it("uses initial value before first evaluation", async () => {
    const computed = computedAsync(
      async () => {
        return 42;
      },
      { initial: 0 }
    );

    expect(computed.value).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(computed.value).toBe(42);

    computed.dispose();
  });

  it("tracks signal dependencies and re-evaluates", async () => {
    const count = signal(5);

    const computed = computedAsync(async () => {
      return count.value * 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(10);

    // Update the signal
    count.value = 10;

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(20);

    computed.dispose();
  });

  it("only tracks signals that are actually read", async () => {
    const count = signal(5);
    const name = signal("alice");
    let evalCount = 0;

    const computed = computedAsync(async () => {
      evalCount++;
      return count.value * 2; // Only reads count, not name
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(10);
    expect(evalCount).toBe(1);

    // Update name - should NOT trigger re-evaluation
    name.value = "bob";
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(evalCount).toBe(1); // Still 1

    // Update count - should trigger re-evaluation
    count.value = 7;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(14);
    expect(evalCount).toBe(2);

    computed.dispose();
  });

  it("handles errors gracefully", async () => {
    const computed = computedAsync(async () => {
      throw new Error("Test error");
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(computed.loading).toBe(false);
    expect(computed.value).toBe(undefined);
    expect(computed.error).toBeInstanceOf(Error);
    expect(computed.error?.message).toBe("Test error");

    computed.dispose();
  });

  it("cancels stale evaluations", async () => {
    const count = signal(1);
    const results: number[] = [];

    const computed = computedAsync(async () => {
      const current = count.value;
      // Simulate varying async delays
      await new Promise((resolve) => setTimeout(resolve, current * 10));
      results.push(current);
      return current;
    });

    // Rapidly update count
    count.value = 2;
    count.value = 3;

    // Wait for all to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Only the last value should be set
    expect(computed.value).toBe(3);

    computed.dispose();
  });

  it("keeps stale value while revalidating by default", async () => {
    const count = signal(5);
    const capturedValues: (number | undefined)[] = [];

    // IMPORTANT: Signal reads must happen BEFORE any await for tracking to work
    const computed = computedAsync(async () => {
      const val = count.value; // Read signal BEFORE await
      await new Promise((resolve) => setTimeout(resolve, 20));
      return val * 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(10);
    capturedValues.push(computed.value);

    // Update
    count.value = 7;

    // Capture value immediately after update (before re-evaluation completes)
    // With staleWhileRevalidate=true, should still be 10
    await new Promise((resolve) => setTimeout(resolve, 5));
    capturedValues.push(computed.value);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(14);
    capturedValues.push(computed.value);

    // First value should be 10, middle should still be 10 (stale), last should be 14
    expect(capturedValues[0]).toBe(10);
    expect(capturedValues[1]).toBe(10); // Still stale
    expect(capturedValues[2]).toBe(14);

    computed.dispose();
  });

  it("clears value when staleWhileRevalidate is false", async () => {
    const count = signal(5);
    const capturedValues: (number | undefined)[] = [];

    // IMPORTANT: Signal reads must happen BEFORE any await for tracking to work
    const computed = computedAsync(
      async () => {
        const val = count.value; // Read signal BEFORE await
        await new Promise((resolve) => setTimeout(resolve, 20));
        return val * 2;
      },
      { staleWhileRevalidate: false, initial: 0 }
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(10);
    capturedValues.push(computed.value);

    // Update
    count.value = 7;

    // Capture value immediately after update
    // With staleWhileRevalidate=false, should reset to initial (0)
    await new Promise((resolve) => setTimeout(resolve, 5));
    capturedValues.push(computed.value);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(14);
    capturedValues.push(computed.value);

    // First value should be 10, middle should be 0 (reset to initial), last should be 14
    expect(capturedValues[0]).toBe(10);
    expect(capturedValues[1]).toBe(0); // Reset to initial
    expect(capturedValues[2]).toBe(14);

    computed.dispose();
  });

  it("can compose with other computedAsync values", async () => {
    const items = signal([1, 2, 3, 4, 5]);

    const filtered = computedAsync(async () => {
      return items.value.filter((x) => x > 2);
    });

    const count = computedAsync(async () => {
      const arr = filtered.value;
      return arr ? arr.length : 0;
    });

    // Wait for both to evaluate
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(filtered.value).toEqual([3, 4, 5]);
    expect(count.value).toBe(3);

    // Update source
    items.value = [1, 2, 3, 4, 5, 6, 7];

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(filtered.value).toEqual([3, 4, 5, 6, 7]);
    expect(count.value).toBe(5);

    filtered.dispose();
    count.dispose();
  });
});

describe("computedAsyncSignals", () => {
  it("returns signal references for direct subscription", async () => {
    const count = signal(5);

    const computed = computedAsyncSignals(async () => {
      return count.value * 2;
    });

    // Can subscribe to signals directly
    const values: (number | undefined)[] = [];
    const dispose = effect(() => {
      values.push(computed.value.value);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should have captured initial undefined and then the computed value
    expect(values).toContain(10);

    count.value = 7;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(values).toContain(14);

    dispose();
    computed.dispose();
  });
});
