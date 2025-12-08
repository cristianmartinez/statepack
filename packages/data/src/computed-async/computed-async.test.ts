import { describe, expect, it } from "bun:test";
import { signal } from "@preact/signals-core";
import { computedAsync } from "./index";

describe("computedAsync", () => {
  it("evaluates async function and updates value", async () => {
    const computed = computedAsync([], async () => {
      return 42;
    });

    expect(computed.loading).toBe(true);
    expect(computed.value).toBe(undefined);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(computed.loading).toBe(false);
    expect(computed.value).toBe(42);
    expect(computed.error).toBe(undefined);

    computed.dispose();
  });

  it("uses initial value before first evaluation", async () => {
    const computed = computedAsync(
      [],
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

  it("re-evaluates when dependency signals change", async () => {
    const count = signal(5);

    const computed = computedAsync([count], async () => {
      return count.value * 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(10);

    count.value = 10;

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(20);

    computed.dispose();
  });

  it("only re-evaluates when listed deps change, not other signals", async () => {
    const count = signal(5);
    const name = signal("alice");
    let evalCount = 0;

    // Only count is in deps, not name
    const computed = computedAsync([count], async () => {
      evalCount++;
      return count.value * 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(10);
    expect(evalCount).toBe(1);

    // Update name - should NOT trigger re-evaluation (not in deps)
    name.value = "bob";
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(evalCount).toBe(1);

    // Update count - should trigger re-evaluation
    count.value = 7;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed.value).toBe(14);
    expect(evalCount).toBe(2);

    computed.dispose();
  });

  it("handles errors gracefully", async () => {
    const computed = computedAsync([], async () => {
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

    const computed = computedAsync([count], async () => {
      const current = count.value;
      await new Promise((resolve) => setTimeout(resolve, current * 10));
      results.push(current);
      return current;
    });

    count.value = 2;
    count.value = 3;

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(computed.value).toBe(3);

    computed.dispose();
  });

  it("keeps stale value while revalidating by default", async () => {
    const count = signal(5);
    const capturedValues: (number | undefined)[] = [];

    const computed = computedAsync([count], async () => {
      const val = count.value;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return val * 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(10);
    capturedValues.push(computed.value);

    count.value = 7;

    await new Promise((resolve) => setTimeout(resolve, 5));
    capturedValues.push(computed.value);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(14);
    capturedValues.push(computed.value);

    expect(capturedValues[0]).toBe(10);
    expect(capturedValues[1]).toBe(10); // Still stale
    expect(capturedValues[2]).toBe(14);

    computed.dispose();
  });

  it("clears value when staleWhileRevalidate is false", async () => {
    const count = signal(5);
    const capturedValues: (number | undefined)[] = [];

    const computed = computedAsync(
      [count],
      async () => {
        const val = count.value;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return val * 2;
      },
      { staleWhileRevalidate: false, initial: 0 }
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(10);
    capturedValues.push(computed.value);

    count.value = 7;

    await new Promise((resolve) => setTimeout(resolve, 5));
    capturedValues.push(computed.value);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(computed.value).toBe(14);
    capturedValues.push(computed.value);

    expect(capturedValues[0]).toBe(10);
    expect(capturedValues[1]).toBe(0); // Reset to initial
    expect(capturedValues[2]).toBe(14);

    computed.dispose();
  });

  it("works with multiple dependencies", async () => {
    const price = signal(10);
    const quantity = signal(3);

    const total = computedAsync([price, quantity], async () => {
      return price.value * quantity.value;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(total.value).toBe(30);

    price.value = 20;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(total.value).toBe(60);

    quantity.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(total.value).toBe(100);

    total.dispose();
  });
});
