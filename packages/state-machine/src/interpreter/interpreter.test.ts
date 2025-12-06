import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals-core";
import type { Machine } from "../schema/types";
import { interpretWithSignals } from "./interpreter";

describe("SignalInterpreter", () => {
  describe("basic transitions", () => {
    const simpleMachine: Machine = {
      id: "simple",
      initial: "idle",
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          on: {
            STOP: "idle",
          },
        },
      },
    };

    test("starts in initial state", async () => {
      const interpreter = interpretWithSignals(simpleMachine);
      await interpreter.start();

      expect(interpreter.state.value).toBe("idle");
    });

    test("transitions on event", async () => {
      const interpreter = interpretWithSignals(simpleMachine);
      await interpreter.start();

      await interpreter.send("START");
      expect(interpreter.state.value).toBe("running");
    });

    test("multiple transitions", async () => {
      const interpreter = interpretWithSignals(simpleMachine);
      await interpreter.start();

      await interpreter.send("START");
      await interpreter.send("STOP");
      expect(interpreter.state.value).toBe("idle");
    });

    test("ignores unknown events", async () => {
      const interpreter = interpretWithSignals(simpleMachine);
      await interpreter.start();

      await interpreter.send("UNKNOWN");
      expect(interpreter.state.value).toBe("idle");
    });

    test("state signal notifies on transition", async () => {
      const interpreter = interpretWithSignals(simpleMachine);
      await interpreter.start();

      let stateUpdates = 0;
      const dispose = effect(() => {
        interpreter.state.value;
        stateUpdates++;
      });

      stateUpdates = 0; // Reset after initial effect run

      await interpreter.send("START");
      expect(stateUpdates).toBe(1);

      await interpreter.send("STOP");
      expect(stateUpdates).toBe(2);

      dispose();
    });
  });

  describe("context", () => {
    const counterMachine: Machine = {
      id: "counter",
      initial: "active",
      store: {
        counter: {
          context: { count: 0, name: "counter" },
          mutations: {
            increment: { count: "context.count + 1" },
            decrement: { count: "context.count - 1" },
            set: { count: "event.value" },
            rename: { name: "event.name" },
          },
        },
      },
      states: {
        active: {
          on: {
            INCREMENT: {
              actions: [{ type: "mutation", name: "increment" }],
            },
            DECREMENT: {
              actions: [{ type: "mutation", name: "decrement" }],
            },
            SET: {
              actions: [{ type: "mutation", name: "set" }],
            },
            RENAME: {
              actions: [{ type: "mutation", name: "rename" }],
            },
          },
        },
      },
    };

    test("initializes context", async () => {
      const interpreter = interpretWithSignals(counterMachine);
      await interpreter.start();

      expect(interpreter.context.count).toBe(0);
      expect(interpreter.context.name).toBe("counter");
    });

    test("updates context with mutation", async () => {
      const interpreter = interpretWithSignals(counterMachine);
      await interpreter.start();

      await interpreter.send("INCREMENT");
      expect(interpreter.context.count).toBe(1);

      await interpreter.send("INCREMENT");
      expect(interpreter.context.count).toBe(2);

      await interpreter.send("DECREMENT");
      expect(interpreter.context.count).toBe(1);
    });

    test("accesses event payload", async () => {
      const interpreter = interpretWithSignals(counterMachine);
      await interpreter.start();

      await interpreter.send({ type: "SET", value: 42 });
      expect(interpreter.context.count).toBe(42);
    });
  });

  describe("getSnapshot compatibility", () => {
    const machine: Machine = {
      id: "snapshot",
      initial: "idle",
      store: {
        main: { context: { count: 5 } },
      },
      states: {
        idle: {
          on: { GO: "running" },
        },
        running: {},
      },
    };

    test("returns plain state object", async () => {
      const interpreter = interpretWithSignals(machine);
      await interpreter.start();

      const snapshot = interpreter.getSnapshot();

      expect(snapshot.value).toBe("idle");
      expect(snapshot.context.count).toBe(5);
      expect(snapshot.done).toBe(false);
    });

    test("snapshot reflects current values", async () => {
      const interpreter = interpretWithSignals(machine);
      await interpreter.start();

      await interpreter.send("GO");

      const snapshot = interpreter.getSnapshot();
      expect(snapshot.value).toBe("running");
    });
  });

  describe("done signal", () => {
    const finalMachine: Machine = {
      id: "final",
      initial: "active",
      states: {
        active: {
          on: { FINISH: "done" },
        },
        done: {
          type: "final",
        },
      },
    };

    test("done signal updates when reaching final state", async () => {
      const interpreter = interpretWithSignals(finalMachine);
      await interpreter.start();

      expect(interpreter.done.value).toBe(false);

      await interpreter.send("FINISH");

      expect(interpreter.done.value).toBe(true);
    });

    test("onDone callback fires", async () => {
      let doneCalled = false;

      const interpreter = interpretWithSignals(finalMachine, {
        onDone: () => {
          doneCalled = true;
        },
      });
      await interpreter.start();

      await interpreter.send("FINISH");

      expect(doneCalled).toBe(true);
    });
  });

  describe("lastEvent signal", () => {
    const machine: Machine = {
      id: "events",
      initial: "idle",
      states: {
        idle: {
          on: { GO: "running" },
        },
        running: {
          on: { STOP: "idle" },
        },
      },
    };

    test("lastEvent updates on transition", async () => {
      const interpreter = interpretWithSignals(machine);
      await interpreter.start();

      expect(interpreter.lastEvent.value).toBeUndefined();

      await interpreter.send("GO");
      expect(interpreter.lastEvent.value).toEqual({ type: "GO" });

      await interpreter.send({ type: "STOP", reason: "done" });
      expect(interpreter.lastEvent.value).toEqual({ type: "STOP", reason: "done" });
    });
  });

  describe("guards", () => {
    const guardedMachine: Machine = {
      id: "guarded",
      initial: "idle",
      store: {
        main: { context: { value: 5 } },
      },
      guards: {
        isPositive: {
          condition: {
            type: "compare",
            op: ">",
            left: { type: "ref", path: "context.value" },
            right: { type: "literal", value: 0 },
          },
        },
        isNegative: {
          condition: {
            type: "compare",
            op: "<",
            left: { type: "ref", path: "context.value" },
            right: { type: "literal", value: 0 },
          },
        },
      },
      states: {
        idle: {
          on: {
            CHECK: [
              { target: "positive", guard: "isPositive" },
              { target: "negative", guard: "isNegative" },
              { target: "zero" },
            ],
          },
        },
        positive: {},
        negative: {},
        zero: {},
      },
    };

    test("uses named guards", async () => {
      const interpreter = interpretWithSignals(guardedMachine);
      await interpreter.start();

      await interpreter.send("CHECK");
      expect(interpreter.state.value).toBe("positive");
    });
  });

  describe("entry/exit actions", () => {
    const entryExitMachine: Machine = {
      id: "entry-exit",
      initial: "a",
      store: {
        main: {
          context: { log: [] as string[] },
          mutations: {
            pushEnterA: { log: "$append(context.log, 'enter-a')" },
            pushExitA: { log: "$append(context.log, 'exit-a')" },
            pushEnterB: { log: "$append(context.log, 'enter-b')" },
          },
        },
      },
      states: {
        a: {
          entry: [{ type: "mutation", name: "pushEnterA" }],
          exit: [{ type: "mutation", name: "pushExitA" }],
          on: { GO: "b" },
        },
        b: {
          entry: [{ type: "mutation", name: "pushEnterB" }],
        },
      },
    };

    test("executes entry actions on start", async () => {
      const interpreter = interpretWithSignals(entryExitMachine);
      await interpreter.start();

      expect(interpreter.context.log).toContain("enter-a");
    });

    test("executes exit and entry actions on transition", async () => {
      const interpreter = interpretWithSignals(entryExitMachine);
      await interpreter.start();

      await interpreter.send("GO");

      const log = interpreter.context.log as string[];
      expect(log).toContain("exit-a");
      expect(log).toContain("enter-b");
    });
  });

  describe("stop", () => {
    const machine: Machine = {
      id: "stoppable",
      initial: "running",
      states: {
        running: {
          on: { NEXT: "done" },
        },
        done: {},
      },
    };

    test("stopped interpreter ignores events", async () => {
      const interpreter = interpretWithSignals(machine);
      await interpreter.start();

      interpreter.stop();

      await interpreter.send("NEXT");
      expect(interpreter.state.value).toBe("running");
    });
  });

  describe("matches", () => {
    const nestedMachine: Machine = {
      id: "nested",
      initial: "parent",
      states: {
        parent: {
          initial: "child1",
          states: {
            child1: {
              on: { NEXT: "child2" },
            },
            child2: {},
          },
        },
      },
    };

    test("matches nested state patterns", async () => {
      const interpreter = interpretWithSignals(nestedMachine);
      await interpreter.start();

      expect(interpreter.matches("parent")).toBe(true);
      expect(interpreter.matches("parent.child1")).toBe(true);
      expect(interpreter.matches("parent.child2")).toBe(false);

      await interpreter.send("NEXT");

      expect(interpreter.matches("parent.child2")).toBe(true);
    });
  });

  describe("invoke services", () => {
    // Helper to wait for real time (Bun doesn't support fake timers for setInterval/setTimeout)
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    describe("interval service", () => {
      const timerMachine: Machine = {
        id: "timer",
        initial: "stopped",
        store: {
          timer: {
            context: { ticks: 0 },
            mutations: {
              tick: { ticks: "context.ticks + 1" },
            },
          },
        },
        states: {
          stopped: {
            on: {
              START: "running",
            },
          },
          running: {
            invoke: {
              id: "ticker",
              src: { type: "interval", ms: 10, event: "TICK" }, // Fast interval for quick tests
            },
            on: {
              TICK: { actions: { type: "mutation", name: "tick" } },
              STOP: "stopped",
            },
          },
        },
      };

      test("starts interval when entering state with invoke", async () => {
        const interpreter = interpretWithSignals(timerMachine);
        await interpreter.start();

        expect(interpreter.context.ticks).toBe(0);

        await interpreter.send("START");

        // Wait for a few ticks (10ms interval)
        await wait(35);

        // Should have received at least 2 ticks
        expect(interpreter.context.ticks).toBeGreaterThanOrEqual(2);

        interpreter.stop();
      });

      test("stops interval when exiting state", async () => {
        const interpreter = interpretWithSignals(timerMachine);
        await interpreter.start();

        await interpreter.send("START");

        // Wait for some ticks
        await wait(25);
        const ticksAfterStart = interpreter.context.ticks as number;
        expect(ticksAfterStart).toBeGreaterThan(0);

        // Stop the timer (transitions back to "stopped")
        await interpreter.send("STOP");

        // Wait a bit more
        await wait(25);

        // Ticks should not have increased
        expect(interpreter.context.ticks).toBe(ticksAfterStart);

        interpreter.stop();
      });

      test("stops interval when interpreter stops", async () => {
        const interpreter = interpretWithSignals(timerMachine);
        await interpreter.start();

        await interpreter.send("START");

        // Wait for some ticks
        await wait(25);
        const ticksBefore = interpreter.context.ticks as number;

        interpreter.stop();

        // Wait a bit more
        await wait(25);

        // Ticks should not have increased after stop
        expect(interpreter.context.ticks).toBe(ticksBefore);
      });
    });

    describe("timeout service", () => {
      const delayedMachine: Machine = {
        id: "delayed",
        initial: "waiting",
        store: {
          main: {
            context: { triggered: false },
            mutations: {
              setTriggered: { triggered: "true" },
            },
          },
        },
        states: {
          waiting: {
            invoke: {
              id: "delayed-event",
              src: { type: "timeout", ms: 15, event: "TIMEOUT" }, // Short timeout for quick tests
            },
            on: {
              TIMEOUT: {
                target: "done",
                actions: { type: "mutation", name: "setTriggered" },
              },
              CANCEL: "cancelled",
            },
          },
          done: {},
          cancelled: {},
        },
      };

      test("sends event after timeout", async () => {
        const interpreter = interpretWithSignals(delayedMachine);
        await interpreter.start();

        expect(interpreter.state.value).toBe("waiting");
        expect(interpreter.context.triggered).toBe(false);

        // Wait for timeout
        await wait(30);

        expect(interpreter.state.value).toBe("done");
        expect(interpreter.context.triggered).toBe(true);

        interpreter.stop();
      });

      test("cancels timeout when exiting state early", async () => {
        const interpreter = interpretWithSignals(delayedMachine);
        await interpreter.start();

        expect(interpreter.state.value).toBe("waiting");

        // Cancel before timeout fires
        await interpreter.send("CANCEL");

        expect(interpreter.state.value).toBe("cancelled");

        // Wait past when timeout would have fired
        await wait(30);

        // Should still be cancelled, not done
        expect(interpreter.state.value).toBe("cancelled");
        expect(interpreter.context.triggered).toBe(false);

        interpreter.stop();
      });
    });

    describe("multiple invoke services", () => {
      const multiServiceMachine: Machine = {
        id: "multi",
        initial: "idle",
        store: {
          main: {
            context: { fast: 0, slow: 0 },
            mutations: {
              tickFast: { fast: "context.fast + 1" },
              tickSlow: { slow: "context.slow + 1" },
            },
          },
        },
        states: {
          idle: {
            on: { START: "running" },
          },
          running: {
            invoke: [
              { id: "fast", src: { type: "interval", ms: 5, event: "FAST" } },
              { id: "slow", src: { type: "interval", ms: 20, event: "SLOW" } },
            ],
            on: {
              FAST: { actions: { type: "mutation", name: "tickFast" } },
              SLOW: { actions: { type: "mutation", name: "tickSlow" } },
              STOP: "idle",
            },
          },
        },
      };

      test("runs multiple services concurrently", async () => {
        const interpreter = interpretWithSignals(multiServiceMachine);
        await interpreter.start();

        await interpreter.send("START");

        // Wait for services to tick
        await wait(45);

        // Fast should tick more than slow
        const fast = interpreter.context.fast as number;
        const slow = interpreter.context.slow as number;

        expect(fast).toBeGreaterThan(slow);
        expect(fast).toBeGreaterThanOrEqual(5); // ~9 ticks at 5ms over 45ms
        expect(slow).toBeGreaterThanOrEqual(1); // ~2 ticks at 20ms over 45ms

        interpreter.stop();
      });

      test("stops all services on state exit", async () => {
        const interpreter = interpretWithSignals(multiServiceMachine);
        await interpreter.start();

        await interpreter.send("START");
        await wait(25);

        const fastBefore = interpreter.context.fast as number;
        const slowBefore = interpreter.context.slow as number;

        await interpreter.send("STOP");
        await wait(25);

        // Neither should have increased
        expect(interpreter.context.fast).toBe(fastBefore);
        expect(interpreter.context.slow).toBe(slowBefore);

        interpreter.stop();
      });
    });
  });
});
