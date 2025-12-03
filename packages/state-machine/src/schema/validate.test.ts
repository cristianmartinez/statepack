import { describe, expect, test } from "bun:test";
import {
  validateMachine,
  validateMiniApp,
  isMachine,
  isMiniApp,
  assertMachine,
} from "./validate.ts";
import type { Machine, MiniApp } from "./types.ts";

describe("validateMachine", () => {
  test("validates simple machine", () => {
    const machine = {
      id: "test",
      initial: "idle",
      states: {
        idle: {
          on: { START: "running" },
        },
        running: {
          on: { STOP: "idle" },
        },
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("validates machine with context", () => {
    const machine = {
      id: "counter",
      initial: "active",
      context: {
        count: 0,
        name: "test",
      },
      states: {
        active: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates machine with guards", () => {
    const machine = {
      id: "guarded",
      initial: "idle",
      context: {},
      guards: {
        isReady: { condition: "context.ready" },
      },
      states: {
        idle: {
          on: {
            GO: {
              target: "active",
              guard: "isReady",
            },
          },
        },
        active: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates machine with actions", () => {
    const machine = {
      id: "actions",
      initial: "idle",
      context: { value: 0 },
      actions: {
        increment: {
          type: "assign",
          values: { value: "{{context.value | add:1}}" },
        },
      },
      states: {
        idle: {
          on: {
            INCREMENT: {
              actions: ["increment"],
            },
          },
        },
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates nested states", () => {
    const machine = {
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

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates parallel states", () => {
    const machine = {
      id: "parallel",
      initial: "both",
      states: {
        both: {
          type: "parallel",
          states: {
            regionA: {
              initial: "a1",
              states: {
                a1: {},
                a2: {},
              },
            },
            regionB: {
              initial: "b1",
              states: {
                b1: {},
                b2: {},
              },
            },
          },
        },
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates final states", () => {
    const machine = {
      id: "final",
      initial: "running",
      states: {
        running: {
          on: { DONE: "finished" },
        },
        finished: {
          type: "final",
        },
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates entry/exit actions", () => {
    const machine = {
      id: "entry-exit",
      initial: "idle",
      context: { log: "" },
      states: {
        idle: {
          entry: [{ type: "assign", values: { log: "entered" } }],
          exit: [{ type: "assign", values: { log: "exited" } }],
          on: { GO: "active" },
        },
        active: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates delayed transitions", () => {
    const machine = {
      id: "delayed",
      initial: "showing",
      states: {
        showing: {
          after: {
            "3000": "hidden",
          },
        },
        hidden: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("validates invoke", () => {
    const machine = {
      id: "invoke",
      initial: "loading",
      states: {
        loading: {
          invoke: {
            src: {
              type: "fetch",
              url: "https://api.example.com/data",
            },
            onDone: "success",
            onError: "error",
          },
        },
        success: {},
        error: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(true);
  });

  test("rejects missing id", () => {
    const machine = {
      initial: "idle",
      states: {
        idle: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("rejects missing initial", () => {
    const machine = {
      id: "test",
      states: {
        idle: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
  });

  test("rejects missing states", () => {
    const machine = {
      id: "test",
      initial: "idle",
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
  });

  test("rejects initial state that doesn't exist", () => {
    const machine = {
      id: "test",
      initial: "nonexistent",
      states: {
        idle: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
  });

  test("rejects duplicate state IDs", () => {
    const machine = {
      id: "test",
      initial: "a",
      states: {
        a: {
          id: "shared",
        },
        b: {
          id: "shared",
        },
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  test("rejects nested states without initial", () => {
    const machine = {
      id: "test",
      initial: "parent",
      states: {
        parent: {
          states: {
            child1: {},
            child2: {},
          },
        },
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no initial"))).toBe(true);
  });

  test("rejects final state with transitions", () => {
    const machine = {
      id: "test",
      initial: "done",
      states: {
        done: {
          type: "final",
          on: {
            RESTART: "other",
          },
        },
        other: {},
      },
    };

    const result = validateMachine(machine);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Final state"))).toBe(true);
  });
});

describe("validateMiniApp", () => {
  test("validates mini-app with machine", () => {
    const app = {
      machine: {
        id: "app",
        initial: "home",
        context: {},
        states: {
          home: {},
        },
      },
    };

    const result = validateMiniApp(app);
    expect(result.valid).toBe(true);
  });

  test("validates mini-app with guards and actions", () => {
    const app = {
      machine: {
        id: "app",
        initial: "idle",
        context: { count: 0 },
        states: {
          idle: {
            on: {
              INCREMENT: {
                guard: "canIncrement",
                actions: ["doIncrement"],
              },
            },
          },
        },
      },
      guards: {
        canIncrement: { condition: "context.count < 10" },
      },
      actions: {
        doIncrement: {
          type: "assign",
          values: { count: "{{context.count | add:1}}" },
        },
      },
    };

    const result = validateMiniApp(app);
    expect(result.valid).toBe(true);
  });
});

describe("isMachine", () => {
  test("returns true for valid machine", () => {
    const machine = {
      id: "test",
      initial: "idle",
      states: { idle: {} },
    };
    expect(isMachine(machine)).toBe(true);
  });

  test("returns false for invalid machine", () => {
    expect(isMachine({})).toBe(false);
    expect(isMachine({ id: "test" })).toBe(false);
  });
});

describe("isMiniApp", () => {
  test("returns true for valid mini-app", () => {
    const app = {
      machine: {
        id: "app",
        initial: "home",
        states: { home: {} },
      },
    };
    expect(isMiniApp(app)).toBe(true);
  });

  test("returns false for invalid mini-app", () => {
    expect(isMiniApp({})).toBe(false);
  });
});

describe("assertMachine", () => {
  test("does not throw for valid machine", () => {
    const machine = {
      id: "test",
      initial: "idle",
      states: { idle: {} },
    };
    expect(() => assertMachine(machine)).not.toThrow();
  });

  test("throws for invalid machine", () => {
    expect(() => assertMachine({})).toThrow("Invalid machine");
  });
});
