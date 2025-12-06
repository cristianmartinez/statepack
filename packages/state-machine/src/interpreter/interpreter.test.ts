import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals-core";
import type { Machine } from "../schema/types";
import { SignalInterpreter, interpretWithSignals } from "./interpreter";

describe("SignalInterpreter", () => {
  describe("basic transitions", () => {
    const simpleMachine: Machine = {
      id: "simple",
      initial: "idle",
      context: {},
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
      context: { count: 0, name: "counter" },
      states: {
        active: {
          on: {
            INCREMENT: {
              actions: [{ type: "assign", values: { count: "context.count + 1" } }],
            },
            DECREMENT: {
              actions: [{ type: "assign", values: { count: "context.count - 1" } }],
            },
            SET: {
              actions: [{ type: "assign", values: { count: "event.value" } }],
            },
            RENAME: {
              actions: [{ type: "assign", values: { name: "event.name" } }],
            },
          },
        },
      },
    };

    test("initializes context", async () => {
      const interpreter = interpretWithSignals<{ count: number; name: string }>(counterMachine);
      await interpreter.start();

      expect(interpreter.context.count).toBe(0);
      expect(interpreter.context.name).toBe("counter");
    });

    test("updates context with assign", async () => {
      const interpreter = interpretWithSignals<{ count: number; name: string }>(counterMachine);
      await interpreter.start();

      await interpreter.send("INCREMENT");
      expect(interpreter.context.count).toBe(1);

      await interpreter.send("INCREMENT");
      expect(interpreter.context.count).toBe(2);

      await interpreter.send("DECREMENT");
      expect(interpreter.context.count).toBe(1);
    });

    test("accesses event payload", async () => {
      const interpreter = interpretWithSignals<{ count: number; name: string }>(counterMachine);
      await interpreter.start();

      await interpreter.send({ type: "SET", value: 42 });
      expect(interpreter.context.count).toBe(42);
    });
  });

  describe("getSnapshot compatibility", () => {
    const machine: Machine = {
      id: "snapshot",
      initial: "idle",
      context: { count: 5 },
      states: {
        idle: {
          on: { GO: "running" },
        },
        running: {},
      },
    };

    test("returns plain state object", async () => {
      const interpreter = interpretWithSignals<{ count: number }>(machine);
      await interpreter.start();

      const snapshot = interpreter.getSnapshot();

      expect(snapshot.value).toBe("idle");
      expect(snapshot.context.count).toBe(5);
      expect(snapshot.done).toBe(false);
    });

    test("snapshot reflects current values", async () => {
      const interpreter = interpretWithSignals<{ count: number }>(machine);
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
      context: {},
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
      context: {},
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
      context: { value: 5 },
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
      const interpreter = interpretWithSignals<{ value: number }>(guardedMachine);
      await interpreter.start();

      await interpreter.send("CHECK");
      expect(interpreter.state.value).toBe("positive");
    });
  });

  describe("entry/exit actions", () => {
    const entryExitMachine: Machine = {
      id: "entry-exit",
      initial: "a",
      context: { log: [] as string[] },
      states: {
        a: {
          entry: [{ type: "assign", values: { log: "$append(context.log, 'enter-a')" } }],
          exit: [{ type: "assign", values: { log: "$append(context.log, 'exit-a')" } }],
          on: { GO: "b" },
        },
        b: {
          entry: [{ type: "assign", values: { log: "$append(context.log, 'enter-b')" } }],
        },
      },
    };

    test("executes entry actions on start", async () => {
      const interpreter = interpretWithSignals<{ log: string[] }>(entryExitMachine);
      await interpreter.start();

      expect(interpreter.context.log).toContain("enter-a");
    });

    test("executes exit and entry actions on transition", async () => {
      const interpreter = interpretWithSignals<{ log: string[] }>(entryExitMachine);
      await interpreter.start();

      await interpreter.send("GO");

      const log = interpreter.context.log;
      expect(log).toContain("exit-a");
      expect(log).toContain("enter-b");
    });
  });

  describe("stop", () => {
    const machine: Machine = {
      id: "stoppable",
      initial: "running",
      context: {},
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
      context: {},
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
});
