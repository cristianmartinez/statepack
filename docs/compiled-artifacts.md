# Portable compiled machine artifacts

Statepack can compile a Yexp machine into a plain JSON program, store it, and
load it into the JavaScript runtime without recompiling expression source.
This is an experimental implementation format, not an accepted cross-language
protocol. Rust, Go, and Zig runtimes implement the shared initial
[statepack.native/1 execution profile](../runtimes/README.md). They reject features
outside that profile; full statechart and Yexp compatibility are not yet claimed.

## Compile, save, load, run

```typescript
import {
  compileMachineArtifact,
  loadMachineArtifact,
  interpretWithSignals,
} from "@statepack/state-machine";

const artifact = compileMachineArtifact({
  id: "counter",
  expressionEngine: "yexp",
  initial: "active",
  store: {
    counter: {
      context: { count: 0 },
      queries: { doubled: "$.context.count * 2" },
      mutations: {
        increment: { count: "$.context.count + $.event.amount" },
      },
    },
  },
  states: {
    active: {
      on: {
        INCREMENT: { actions: [{ type: "mutation", name: "increment" }] },
      },
    },
  },
});

const saved = JSON.stringify(artifact);
// Store or transfer `saved` using your application's persistence mechanism.
const loaded = loadMachineArtifact(JSON.parse(saved));
const runtime = interpretWithSignals(loaded);
await runtime.start();
await runtime.send({ type: "INCREMENT", amount: 3 });
console.log(runtime.getSliceContext("counter").count); // 3
runtime.stop();
```

[compiled-counter.json](examples/compiled-counter.json) is a complete generated
artifact that can be passed to `loadMachineArtifact`.

For an existing runtime compiled object, use `serializeMachine(compiled)` to
produce the same artifact. These APIs return objects, not JSON text.

## Format version 1

| Field | Meaning |
| --- | --- |
| `format` | `statepack.compiled` |
| `version` | Artifact format version, currently `1` |
| `definition` | Executable machine structure and initial store data |
| `expressions` | Machine-level `[expressionId, yexpArtifact]` pairs |
| `slices` | Named slices with their own expression tables |

Expression-bearing fields in `definition` use generated lookup IDs, such as
`expr:0`. Expression artifacts contain `engine: "yexp"`, `artifactVersion: 1`,
and `program`, including Yexp bytecode version `1`, slots, constants, and
instructions. Slots are data paths used by the VM, not expression source.
Nested lambdas retain their nested compiled programs. Authoring expression
source is omitted. Initial data, state names, named action references, mutation
names, and mutation payloads remain literal values.

The generated IDs avoid collisions with strings already in the authoring
machine. The artifact has no compilation timestamp, so compiling the same
input produces the same structure. IDs are local implementation references;
they are not persistent identities for future migrations.

The `definition` is an execution plan shaped like the current Machine schema.
Load it through `loadMachineArtifact`; do not send it back through
`compileMachine` as an authoring definition. Loading builds Maps for the current
JavaScript interpreter, but Maps and runtime objects are never saved in JSON.
No compiler is called during loading or execution of the saved artifact.

## Validation and compatibility

Only Yexp machines can be exported. JSONata compiled objects contain executable
runtime objects and are rejected. Non-JSON values, non-finite numbers, cycles,
and sparse arrays are rejected before JSON serialization can change them.

The loader checks the artifact and engine versions, machine schema and existing
semantic validation, duplicate expression/slice entries, required store programs,
and bytecode structure. Bytecode checks include known opcodes, basic table and
jump references, and nested lambda programs. Loading takes ownership of its data;
mutating the supplied object afterward does not mutate the runtime.

Artifacts must come from trusted compilers. These checks are not a complete
bytecode verifier, execution budget, or proof of termination. The current
expression profile retains Yexp's time/random built-ins. Host effects continue
to use Statepack's existing host callback and service behavior; exporting JSON
does not add missing service implementations or full native-runtime conformance.

## Program versus instance

This format stores a program and its initial data. It does not save a running
instance, current data changes, timers, pending effects, or event queues. Durable
instance snapshots and restoration need a separate contract.

The native runtimes and JavaScript reference now share stored conformance
fixtures. Next protocol work is expanding that corpus, freezing broader machine
semantics, and extending the portable profile and capability requirements.
An execution-only package that omits compiler code is also a separate delivery
step; this loader does not call the compiler, but current bundles still include it.
