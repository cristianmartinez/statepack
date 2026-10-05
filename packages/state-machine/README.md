# @statepack/state-machine

Defines, validates, compiles, and runs state machines. Data lives in named store
slices; mutations use JSONata expressions.

## Example

Use in a workspace package that depends on `@statepack/state-machine`. Build the
supporting packages with `bun run build` first.

```typescript
import { compileMachine, interpretWithSignals, type Machine } from "@statepack/state-machine";

const machine: Machine = {
  id: "counter",
  initial: "active",
  store: {
    counter: {
      context: { count: 0 },
      mutations: {
        increment: { count: "context.count + 1" },
      },
    },
  },
  states: {
    active: {
      on: {
        INCREMENT: {
          actions: [{ type: "mutation", name: "increment" }],
        },
      },
    },
  },
};

const restored = JSON.parse(JSON.stringify(machine));
const interpreter = interpretWithSignals(compileMachine(restored));
await interpreter.start();
await interpreter.send("INCREMENT");

console.log(interpreter.state.value); // active
console.log(interpreter.getSliceContext("counter")); // { count: 1 }
interpreter.stop();
```

## Runtime API

- `compileMachine(machine)` compiles expressions and store definitions.
- `interpretWithSignals(machine, options?)` accepts a definition or compiled machine.
- `start()` enters the initial state; `send(event)` processes a string or event object.
- `stop()` stops the interpreter and cleans up timers and services.
- `state`, `done`, and `lastEvent` are signals.
- `getSliceContext(name)` returns plain values for a store slice.
- `getSignalScope(name)` exposes a slice's reactive scope and machine state.

Use `validateMachine`, `isMachine`, or `assertMachine` to check definitions.
See [schema/types.ts](src/schema/types.ts) for the supported definition fields
and [interpreter tests](src/interpreter/interpreter.test.ts) for transition,
guard, mutation, and timer examples.

External effects are passed to the interpreter's `execute` callback. Their
behavior depends on the host implementation.
