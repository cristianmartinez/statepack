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

## Yexp expressions

Set `expressionEngine: "yexp"` on a machine definition to use Yexp for store
queries, mutations, and compiled action values. Omit the field to retain JSONata.
Guards continue to use the existing structured condition schema.

For example, the counter above can select Yexp and define its increment mutation
as `"$.context.count + 1"`. Event payloads are available through `$.event`.
Standalone data/store compilation also accepts `{ engine: "yexp" }` as its
second argument. Reactive queries continue to track the current context and
query signals broadly.

Yexp expression artifacts survive a JSON round trip. Use `compileMachineArtifact`
to export a complete machine as JSON and `loadMachineArtifact` to load it without
recompiling expressions. Existing runtime `CompiledMachine` and `CompiledStore`
objects still contain Maps; use `serializeMachine` to export a compiled machine.
See [portable compiled artifacts](../../docs/compiled-artifacts.md) for the format,
examples, and current compatibility limits.

This integration retains the existing action-value convention: strings that
compile are evaluated as expressions. For Yexp action parameters, quote literal
strings inside the expression (for example, `"\"greeting\""`), since a bare
identifier is a lookup. Explicit expression wrappers are still protocol work.
