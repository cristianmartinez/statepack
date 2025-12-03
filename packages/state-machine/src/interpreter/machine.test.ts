import { describe, expect, test } from "bun:test";
import type { Machine } from "../schema/types";
import { interpret } from "./machine";

describe("Interpreter", () => {
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

    test("starts in initial state", () => {
      const interpreter = interpret(simpleMachine);
      interpreter.start();

      expect(interpreter.getSnapshot().value).toBe("idle");
    });

    test("transitions on event", () => {
      const interpreter = interpret(simpleMachine);
      interpreter.start();

      interpreter.send("START");
      expect(interpreter.getSnapshot().value).toBe("running");
    });

    test("multiple transitions", () => {
      const interpreter = interpret(simpleMachine);
      interpreter.start();

      interpreter.send("START");
      interpreter.send("STOP");
      expect(interpreter.getSnapshot().value).toBe("idle");
    });

    test("ignores unknown events", () => {
      const interpreter = interpret(simpleMachine);
      interpreter.start();

      interpreter.send("UNKNOWN");
      expect(interpreter.getSnapshot().value).toBe("idle");
    });
  });

  describe("context", () => {
    const counterMachine: Machine = {
      id: "counter",
      initial: "active",
      context: { count: 0 },
      states: {
        active: {
          on: {
            INCREMENT: {
              actions: [{ type: "assign", values: { count: "{{context.count | add:1}}" } }],
            },
            DECREMENT: {
              actions: [{ type: "assign", values: { count: "{{context.count | add:-1}}" } }],
            },
            SET: {
              actions: [{ type: "assign", values: { count: "{{event.value}}" } }],
            },
          },
        },
      },
    };

    test("initializes context", () => {
      const interpreter = interpret(counterMachine);
      interpreter.start();

      expect(interpreter.getSnapshot().context.count).toBe(0);
    });

    test("updates context with assign", () => {
      const interpreter = interpret(counterMachine);
      interpreter.start();

      interpreter.send("INCREMENT");
      expect(interpreter.getSnapshot().context.count).toBe(1);

      interpreter.send("INCREMENT");
      expect(interpreter.getSnapshot().context.count).toBe(2);

      interpreter.send("DECREMENT");
      expect(interpreter.getSnapshot().context.count).toBe(1);
    });

    test("accesses event payload", () => {
      const interpreter = interpret(counterMachine);
      interpreter.start();

      interpreter.send({ type: "SET", value: 42 });
      expect(interpreter.getSnapshot().context.count).toBe(42);
    });
  });

  describe("guards", () => {
    const guardedMachine: Machine = {
      id: "guarded",
      initial: "idle",
      context: { value: 5 },
      guards: {
        isPositive: { condition: "context.value > 0" },
        isNegative: { condition: "context.value < 0" },
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

    test("uses named guards", () => {
      const interpreter = interpret(guardedMachine);
      interpreter.start();

      interpreter.send("CHECK");
      expect(interpreter.getSnapshot().value).toBe("positive");
    });

    test("falls through to next transition", () => {
      const machine = { ...guardedMachine, context: { value: 0 } };
      const interpreter = interpret(machine);
      interpreter.start();

      interpreter.send("CHECK");
      expect(interpreter.getSnapshot().value).toBe("zero");
    });

    test("inline guards", () => {
      const machine: Machine = {
        id: "inline-guard",
        initial: "idle",
        context: { ready: true },
        states: {
          idle: {
            on: {
              GO: {
                target: "active",
                guard: { condition: "context.ready" },
              },
            },
          },
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("GO");
      expect(interpreter.getSnapshot().value).toBe("active");
    });

    test("AND guards", () => {
      const machine: Machine = {
        id: "and-guard",
        initial: "idle",
        context: { a: true, b: true },
        guards: {
          checkA: { condition: "context.a" },
          checkB: { condition: "context.b" },
        },
        states: {
          idle: {
            on: {
              GO: {
                target: "active",
                guard: { and: ["checkA", "checkB"] },
              },
            },
          },
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("GO");
      expect(interpreter.getSnapshot().value).toBe("active");
    });

    test("OR guards", () => {
      const machine: Machine = {
        id: "or-guard",
        initial: "idle",
        context: { a: false, b: true },
        guards: {
          checkA: { condition: "context.a" },
          checkB: { condition: "context.b" },
        },
        states: {
          idle: {
            on: {
              GO: {
                target: "active",
                guard: { or: ["checkA", "checkB"] },
              },
            },
          },
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("GO");
      expect(interpreter.getSnapshot().value).toBe("active");
    });

    test("NOT guards", () => {
      const machine: Machine = {
        id: "not-guard",
        initial: "idle",
        context: { blocked: false },
        guards: {
          isBlocked: { condition: "context.blocked" },
        },
        states: {
          idle: {
            on: {
              GO: {
                target: "active",
                guard: { not: "isBlocked" },
              },
            },
          },
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("GO");
      expect(interpreter.getSnapshot().value).toBe("active");
    });
  });

  describe("entry/exit actions", () => {
    test("executes entry actions", () => {
      const machine: Machine = {
        id: "entry-test",
        initial: "idle",
        context: { entered: false },
        states: {
          idle: {
            on: { GO: "active" },
          },
          active: {
            entry: [{ type: "assign", values: { entered: true } }],
          },
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("GO");

      expect(interpreter.getSnapshot().context.entered).toBe(true);
    });

    test("executes exit actions", () => {
      const machine: Machine = {
        id: "exit-test",
        initial: "idle",
        context: { exited: false },
        states: {
          idle: {
            on: { GO: "active" },
            exit: [{ type: "assign", values: { exited: true } }],
          },
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("GO");

      expect(interpreter.getSnapshot().context.exited).toBe(true);
    });
  });

  describe("named actions", () => {
    test("resolves named actions", () => {
      const machine: Machine = {
        id: "named-actions",
        initial: "idle",
        context: { value: 0 },
        actions: {
          increment: { type: "assign", values: { value: "{{context.value | add:1}}" } },
        },
        states: {
          idle: {
            on: {
              INCREMENT: { actions: ["increment"] },
            },
          },
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("INCREMENT");

      expect(interpreter.getSnapshot().context.value).toBe(1);
    });

    test("handles array of named actions", () => {
      const machine: Machine = {
        id: "multiple-named",
        initial: "idle",
        context: { a: 0, b: 0 },
        actions: {
          incrementA: { type: "assign", values: { a: "{{context.a | add:1}}" } },
          incrementB: { type: "assign", values: { b: "{{context.b | add:1}}" } },
        },
        states: {
          idle: {
            on: {
              INCREMENT: { actions: ["incrementA", "incrementB"] },
            },
          },
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("INCREMENT");

      expect(interpreter.getSnapshot().context.a).toBe(1);
      expect(interpreter.getSnapshot().context.b).toBe(1);
    });
  });

  describe("self transitions", () => {
    test("self transition without target", () => {
      const machine: Machine = {
        id: "self-transition",
        initial: "active",
        context: { count: 0 },
        states: {
          active: {
            on: {
              INCREMENT: {
                actions: [{ type: "assign", values: { count: "{{context.count | add:1}}" } }],
              },
            },
          },
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();

      interpreter.send("INCREMENT");
      interpreter.send("INCREMENT");

      expect(interpreter.getSnapshot().value).toBe("active");
      expect(interpreter.getSnapshot().context.count).toBe(2);
    });
  });

  describe("final states", () => {
    test("marks machine as done", () => {
      const machine: Machine = {
        id: "final-test",
        initial: "running",
        context: {},
        states: {
          running: {
            on: { FINISH: "done" },
          },
          done: {
            type: "final",
          },
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.send("FINISH");

      expect(interpreter.getSnapshot().done).toBe(true);
    });

    test("calls onDone callback", () => {
      const machine: Machine = {
        id: "ondone-test",
        initial: "running",
        context: {},
        states: {
          running: {
            on: { FINISH: "done" },
          },
          done: {
            type: "final",
          },
        },
      };

      let doneState: unknown = null;
      const interpreter = interpret(machine, {
        onDone: (state) => {
          doneState = state;
        },
      });

      interpreter.start();
      interpreter.send("FINISH");

      expect(doneState).not.toBeNull();
    });
  });

  describe("subscribers", () => {
    test("notifies subscribers on transition", () => {
      const machine: Machine = {
        id: "subscriber-test",
        initial: "idle",
        context: {},
        states: {
          idle: { on: { GO: "active" } },
          active: {},
        },
      };

      const states: string[] = [];
      const interpreter = interpret(machine);

      interpreter.subscribe((state) => {
        states.push(state.value as string);
      });

      interpreter.start();
      interpreter.send("GO");

      expect(states).toEqual(["idle", "active"]);
    });

    test("unsubscribes correctly", () => {
      const machine: Machine = {
        id: "unsubscribe-test",
        initial: "idle",
        context: {},
        states: {
          idle: { on: { GO: "active" } },
          active: { on: { BACK: "idle" } },
        },
      };

      const states: string[] = [];
      const interpreter = interpret(machine);

      const unsubscribe = interpreter.subscribe((state) => {
        states.push(state.value as string);
      });

      interpreter.start();
      unsubscribe();
      interpreter.send("GO");

      expect(states).toEqual(["idle"]);
    });
  });

  describe("matches", () => {
    test("matches simple state", () => {
      const machine: Machine = {
        id: "matches-test",
        initial: "idle",
        context: {},
        states: {
          idle: {},
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();

      expect(interpreter.matches("idle")).toBe(true);
      expect(interpreter.matches("active")).toBe(false);
    });
  });

  describe("side effects", () => {
    test("queues effects for execution", async () => {
      const effects: Array<{ type: string; params: Record<string, unknown> }> = [];

      const machine: Machine = {
        id: "effects-test",
        initial: "idle",
        context: {},
        states: {
          idle: {
            on: {
              TOAST: {
                actions: [{ type: "toast", message: "Hello!", variant: "success" }],
              },
            },
          },
        },
      };

      const interpreter = interpret(machine, {
        execute: async (effect) => {
          effects.push(effect);
        },
      });

      interpreter.start();
      interpreter.send("TOAST");

      // Wait for effect to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(effects.length).toBe(1);
      expect(effects[0].type).toBe("toast");
      expect(effects[0].params.message).toBe("Hello!");
    });
  });

  describe("stop/start", () => {
    test("ignores events when stopped", () => {
      const machine: Machine = {
        id: "stop-test",
        initial: "idle",
        context: {},
        states: {
          idle: { on: { GO: "active" } },
          active: {},
        },
      };

      const interpreter = interpret(machine);
      interpreter.start();
      interpreter.stop();
      interpreter.send("GO");

      expect(interpreter.getSnapshot().value).toBe("idle");
    });
  });
});

describe("state matching", () => {
  test("matches nested state", () => {
    const machine: Machine = {
      id: "nested-match",
      initial: "parent",
      context: {},
      states: {
        parent: {
          initial: "child1",
          states: {
            child1: { on: { NEXT: "child2" } },
            child2: {},
          },
        },
      },
    };

    const interpreter = interpret(machine);
    interpreter.start();

    expect(interpreter.matches("parent")).toBe(true);
    expect(interpreter.matches("parent.child1")).toBe(true);
    expect(interpreter.matches("parent.child2")).toBe(false);

    interpreter.send("NEXT");
    expect(interpreter.matches("parent.child2")).toBe(true);
  });
});
