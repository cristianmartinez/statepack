import { describe, expect, test } from "bun:test";
import type { Machine } from "../schema/types";
import {
  createInitialState,
  getActiveStateNodes,
  getLeafStates,
  matchesState,
  toStateString,
} from "./state";

describe("createInitialState", () => {
  test("creates initial state with simple initial", () => {
    const machine: Machine = {
      id: "simple",
      initial: "idle",
      states: {
        idle: {},
        active: {},
      },
    };

    const state = createInitialState(machine);

    expect(state.value).toBe("idle");
    // Context is now managed by Store, not initial state
    expect(state.context).toEqual({});
    expect(state.done).toBe(false);
    expect(state.meta).toEqual({});
    expect(state.children).toEqual(new Map());
  });

  test("creates initial state with nested states", () => {
    const machine: Machine = {
      id: "nested",
      initial: "parent",
      states: {
        parent: {
          initial: "child1",
          states: {
            child1: {},
            child2: {},
          },
        },
      },
    };

    const state = createInitialState(machine);

    expect(state.value).toEqual({ parent: "child1" });
  });

  test("creates initial state with deeply nested states", () => {
    const machine: Machine = {
      id: "deep",
      initial: "level1",
      states: {
        level1: {
          initial: "level2",
          states: {
            level2: {
              initial: "level3",
              states: {
                level3: {},
              },
            },
          },
        },
      },
    };

    const state = createInitialState(machine);

    expect(state.value).toEqual({ level1: { level2: "level3" } });
  });

  test("creates initial state with parallel states", () => {
    const machine: Machine = {
      id: "parallel",
      initial: "active",
      states: {
        active: {
          type: "parallel",
          states: {
            bold: {
              initial: "off",
              states: {
                on: {},
                off: {},
              },
            },
            italic: {
              initial: "off",
              states: {
                on: {},
                off: {},
              },
            },
          },
        },
      },
    };

    const state = createInitialState(machine);

    expect(state.value).toEqual({
      active: {
        bold: "off",
        italic: "off",
      },
    });
  });

  test("collects metadata from active states", () => {
    const machine: Machine = {
      id: "meta",
      initial: "loading",
      states: {
        loading: {
          meta: { label: "Loading...", progress: true },
        },
        ready: {},
      },
    };

    const state = createInitialState(machine);

    expect(state.meta).toEqual({
      loading: { label: "Loading...", progress: true },
    });
  });

  test("handles missing context", () => {
    const machine: Machine = {
      id: "no-context",
      initial: "idle",
      states: {
        idle: {},
      },
    };

    const state = createInitialState(machine);

    expect(state.context).toEqual({});
  });
});

describe("toStateString", () => {
  test("returns simple state string", () => {
    expect(toStateString("idle")).toBe("idle");
  });

  test("converts nested state to dot notation", () => {
    expect(toStateString({ parent: "child" })).toBe("parent.child");
  });

  test("converts deeply nested state", () => {
    expect(toStateString({ a: { b: "c" } })).toBe("a.b.c");
  });

  test("handles parallel states with comma separation", () => {
    // Parallel at top level
    const result = toStateString({ bold: "on", italic: "off" });
    // Order may vary, check both parts exist
    expect(result).toContain("bold.on");
    expect(result).toContain("italic.off");
  });

  test("handles nested parallel state", () => {
    const result = toStateString({ active: { bold: "on", italic: "off" } });
    // The nested object joins its children with comma
    expect(result).toContain("active.");
    expect(result).toContain("bold.on");
    expect(result).toContain("italic.off");
  });
});

describe("matchesState", () => {
  describe("simple states", () => {
    test("matches exact state", () => {
      expect(matchesState("idle", "idle")).toBe(true);
    });

    test("does not match different state", () => {
      expect(matchesState("idle", "active")).toBe(false);
    });

    test("does not match partial pattern on simple state", () => {
      expect(matchesState("idle", "idle.child")).toBe(false);
    });
  });

  describe("nested states", () => {
    test("matches parent state", () => {
      expect(matchesState({ parent: "child" }, "parent")).toBe(true);
    });

    test("matches full nested path", () => {
      expect(matchesState({ parent: "child" }, "parent.child")).toBe(true);
    });

    test("does not match wrong parent", () => {
      expect(matchesState({ parent: "child" }, "other")).toBe(false);
    });

    test("does not match wrong child", () => {
      expect(matchesState({ parent: "child" }, "parent.other")).toBe(false);
    });

    test("matches deeply nested state", () => {
      expect(matchesState({ a: { b: "c" } }, "a")).toBe(true);
      expect(matchesState({ a: { b: "c" } }, "a.b")).toBe(true);
      expect(matchesState({ a: { b: "c" } }, "a.b.c")).toBe(true);
    });

    test("does not match beyond leaf", () => {
      expect(matchesState({ a: { b: "c" } }, "a.b.c.d")).toBe(false);
    });
  });

  describe("parallel states", () => {
    test("matches parallel region", () => {
      const state = { active: { bold: "on", italic: "off" } };
      expect(matchesState(state, "active")).toBe(true);
      expect(matchesState(state, "active.bold")).toBe(true);
      expect(matchesState(state, "active.bold.on")).toBe(true);
      expect(matchesState(state, "active.italic")).toBe(true);
      expect(matchesState(state, "active.italic.off")).toBe(true);
    });
  });
});

describe("getActiveStateNodes", () => {
  test("returns single state node for simple state", () => {
    const machine: Machine = {
      id: "simple",
      initial: "idle",
      states: {
        idle: { meta: { label: "Idle" } },
        active: { meta: { label: "Active" } },
      },
    };

    const nodes = getActiveStateNodes(machine, "idle");

    expect(nodes).toHaveLength(1);
    expect(nodes[0].meta).toEqual({ label: "Idle" });
  });

  test("returns parent and child nodes for nested state", () => {
    const machine: Machine = {
      id: "nested",
      initial: "parent",
      states: {
        parent: {
          initial: "child1",
          meta: { level: "parent" },
          states: {
            child1: { meta: { level: "child" } },
            child2: {},
          },
        },
      },
    };

    const nodes = getActiveStateNodes(machine, { parent: "child1" });

    expect(nodes).toHaveLength(2);
    expect(nodes[0].meta).toEqual({ level: "parent" });
    expect(nodes[1].meta).toEqual({ level: "child" });
  });

  test("returns all active nodes for parallel states", () => {
    const machine: Machine = {
      id: "parallel",
      initial: "active",
      states: {
        active: {
          type: "parallel",
          states: {
            bold: {
              initial: "off",
              states: {
                on: { meta: { bold: true } },
                off: { meta: { bold: false } },
              },
            },
            italic: {
              initial: "off",
              states: {
                on: { meta: { italic: true } },
                off: { meta: { italic: false } },
              },
            },
          },
        },
      },
    };

    const nodes = getActiveStateNodes(machine, {
      active: { bold: "on", italic: "off" },
    });

    // Should have: active, bold, bold.on, italic, italic.off
    expect(nodes.length).toBeGreaterThanOrEqual(3);
  });

  test("returns empty array for unknown state", () => {
    const machine: Machine = {
      id: "simple",
      initial: "idle",
      states: {
        idle: {},
      },
    };

    const nodes = getActiveStateNodes(machine, "unknown");

    expect(nodes).toEqual([]);
  });
});

describe("getLeafStates", () => {
  test("returns simple state as leaf", () => {
    expect(getLeafStates("idle")).toEqual(["idle"]);
  });

  test("returns leaf from nested state", () => {
    expect(getLeafStates({ parent: "child" })).toEqual(["child"]);
  });

  test("returns leaf from deeply nested state", () => {
    expect(getLeafStates({ a: { b: "c" } })).toEqual(["c"]);
  });

  test("returns all leaves from parallel states", () => {
    const result = getLeafStates({ active: { bold: "on", italic: "off" } });
    expect(result).toContain("on");
    expect(result).toContain("off");
    expect(result).toHaveLength(2);
  });

  test("returns multiple leaves from complex parallel state", () => {
    const result = getLeafStates({
      editing: {
        format: { bold: "on", italic: "off", underline: "off" },
        cursor: "visible",
      },
    });
    expect(result).toContain("on");
    expect(result).toContain("off");
    expect(result).toContain("visible");
  });
});
