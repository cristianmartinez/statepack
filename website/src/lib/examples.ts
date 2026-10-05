import type { Machine } from "@statepack/state-machine";

export const examples: Record<
  string,
  { label: string; hint: string; machine: Machine }
> = {
  toggle: {
    label: "Toggle switch",
    hint: "One event. Two states. Try TOGGLE.",
    machine: {
      id: "toggle",
      initial: "off",
      states: {
        off: { on: { TOGGLE: "on" } },
        on: { on: { TOGGLE: "off" } },
      },
    },
  },
  counter: {
    label: "Guarded counter",
    hint: "INCREMENT stops at 5. The guard checks the current count.",
    machine: {
      id: "counter",
      initial: "counting",
      store: {
        counter: {
          context: { count: 0 },
          mutations: {
            increment: { count: "context.count + 1" },
            decrement: { count: "context.count - 1" },
          },
        },
      },
      guards: {
        belowLimit: {
          condition: {
            type: "compare",
            op: "<",
            left: { type: "ref", path: "context.count" },
            right: 5,
          },
        },
        aboveZero: {
          condition: {
            type: "compare",
            op: ">",
            left: { type: "ref", path: "context.count" },
            right: 0,
          },
        },
      },
      states: {
        counting: {
          on: {
            INCREMENT: {
              guard: "belowLimit",
              actions: [{ type: "mutation", name: "increment" }],
            },
            DECREMENT: {
              guard: "aboveZero",
              actions: [{ type: "mutation", name: "decrement" }],
            },
          },
        },
      },
    },
  },
  request: {
    label: "Request lifecycle",
    hint: "An illustrative request. Send RESOLVE or REJECT to choose the result.",
    machine: {
      id: "request",
      initial: "idle",
      states: {
        idle: { on: { FETCH: "loading" } },
        loading: { on: { RESOLVE: "success", REJECT: "error" } },
        success: { on: { RETRY: "idle" } },
        error: { on: { RETRY: "loading" } },
      },
    },
  },
};

export function stateLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, child]) => `${key}.${stateLabel(child)}`)
      .join(" / ");
  }
  return "—";
}

export function activeEvents(machine: Machine, value: unknown): string[] {
  const events = new Set(Object.keys(machine.on ?? {}));
  function collect(states: Machine["states"], state: unknown) {
    if (typeof state === "string") {
      Object.keys(states[state]?.on ?? {}).forEach((event) =>
        events.add(event),
      );
    } else if (state && typeof state === "object") {
      for (const [name, child] of Object.entries(state)) {
        const node = states[name];
        Object.keys(node?.on ?? {}).forEach((event) => events.add(event));
        if (node?.states) collect(node.states, child);
      }
    }
  }
  collect(machine.states, value);
  return [...events];
}
