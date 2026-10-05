# Statepack execution runtimes

Rust, Go, and Zig execute compiled Statepack JSON and Yexp bytecode directly.
They contain no expression-source parser or compiler. The shared initial profile
is `statepack.native/1`; [profile.json](profile.json) lists its 54 opcodes and
8 default functions. The [contract](CONTRACT.md) defines behavior and limits.
The JavaScript runner uses the existing JavaScript runtime as a conformance
reference, with the same default function registry and supported test profile.

## Build and verify

Install Bun and Rust, Go 1.22 or newer, and Zig **0.14.1**. From the repository root:

```sh
bun install
bun run runtimes:build
bun run runtimes:test
```

Set `CARGO`, `GO`, or `ZIG` to executable paths when toolchains are not on PATH.
The build creates these local executables:

| Runtime | Executable | Embedding API |
| --- | --- | --- |
| Rust | `runtimes/rust/target/debug/statepack-runtime` | [Rust library](rust/README.md) |
| Go | `runtimes/go/statepack-go` | [Go package](go/README.md) |
| Zig | `runtimes/zig/zig-out/bin/statepack-zig` | [Zig module](zig/README.md) |
| JavaScript | `bun runtimes/javascript/cli.ts` | Existing Statepack packages |

Go uses its standard library; Rust uses serde_json for JSON data; Zig uses its
standard library. On macOS, the Zig scripts compile with Zig and link with the
system linker to support newer Apple SDKs. Build outputs are ignored by Git.

## Run stored JSON

Each CLI reads one request from stdin and returns one JSON response on stdout:

```json
{
  "mode": "machine",
  "artifact": { "format": "statepack.compiled", "version": 1 },
  "events": [{ "type": "INCREMENT", "amount": 3 }]
}
```

The abbreviated artifact above must be replaced with a complete compiled
artifact, such as [compiled-counter.json](../docs/examples/compiled-counter.json).
Use [compileMachineArtifact](../docs/compiled-artifacts.md) to create artifacts.
Expression mode accepts a compiled Yexp envelope and a JSON evaluation scope.
Capabilities mode (`{"mode":"capabilities"}`) reports the runtime profile.

## Function registry

All runtimes provide `length`, `abs`, `floor`, `ceil`, `round`, `min`, `max`, and
`toString`. Expressions call them through bytecode `CALL` instructions. Hosts
can register named synchronous functions; registrations override standard names.
Callbacks accept JSON arguments and return JSON or a structured error.

In JavaScript:

```typescript
import { createPrimitiveRegistry } from "@statepack/expressions";

const functions = createPrimitiveRegistry().register("double", ([value]) => {
  if (typeof value !== "number") throw new Error("double requires a number");
  return value * 2;
});
const runtime = interpretWithSignals(loadMachineArtifact(artifact), {
  expressionFunctions: functions,
});
```

Rust, Go, and Zig expose the equivalent native callback APIs in their READMEs.
A function's implementation is supplied by the host, not serialized in an
artifact. To run the same artifact everywhere, register the required function
names with equivalent behavior in each host. Registries contain pure computation;
external operations remain machine effects handled by the host.

For CLI diagnostics only, `"registry":{"double":"double"}` installs the
shared numeric doubling callback. It is a test adapter, not a general mechanism
for serializing native code.

## Conformance and boundaries

[cases.json](conformance/cases.json) contains stored bytecode requests and expected
results generated from JavaScript. `bun run runtimes:fixtures` regenerates them
when the contract intentionally changes; tests never regenerate their expected
results. The harness also compares opcode/function capability sets, checks
structured errors by code, and checks successful snapshots by value.

This profile supports flat states, guarded transitions, named actions, entry/exit,
mutations, derived queries, and `log`/`host.event` effect records. Unsupported
features are rejected explicitly before native machine execution. It does not
claim full Yexp or full Statepack statechart compatibility. Hierarchical/parallel
states, timers, invocation, actors, lambda/collection/spread bytecode, expression
mutation, and durable instance restoration are excluded.

Numbers are finite f64 values. Interoperable strings use Unicode scalar values;
length counts UTF-16 units, while selecting an isolated surrogate is unsupported.
Expression ordered comparisons require numbers, matching the reference VM.
Default primitive signatures and errors are fixed by the profile. Instructions
and machine transitions have budgets; host callbacks must apply their own limits.

JavaScript remains the broader reference runtime. Its conformance wrapper is not
an execution-isolation sandbox or a complete native-profile bytecode verifier.
The fixture suite proves the shared cases and declared capabilities, rather than
exhaustive equivalence for every possible JSON input.
