# Zig execution runtime

Requires Zig 0.14.1. This execution-only runtime loads compiled JSON; it does
not include a Yexp source parser or compiler. Implements the shared initial
`statepack.native/1` profile in [the contract](../CONTRACT.md).

```sh
./build.sh
./zig-out/bin/statepack-zig < request.json
```

Set `ZIG` to a custom compiler path. On macOS the build script uses the system
linker for compatibility with newer Apple SDKs. Other platforms use `zig build`.
The CLI processes one JSON request and returns one JSON response. Supported
modes are `expression`, `machine`, and `capabilities`.

## Embedding and pure functions

Import `src/runtime.zig`, construct `Runtime.init(allocator)`, and register native
callbacks with `register(name, callback)`. `evaluate(expressionEnvelope, scope)`
executes actual Yexp bytecode. `Machine.init(&runtime, artifact)` validates and
loads the machine; `machine.run(eventsArray)` processes its events.

```zig
fn double(_: std.mem.Allocator, args: []const runtime.Value)
    runtime.Failure!runtime.Value {
    if (args.len != 1 or args[0] != .float) return error.TYPE_ERROR;
    return .{ .float = args[0].float * 2 };
}

var vm = runtime.Runtime.init(arena.allocator());
try vm.register("double", double);
const result = try vm.evaluate(expression, scope);
```

Callbacks are synchronous pure calls; capability effects are separate output
records for the host to handle. Registry entries override standard names.
Values and allocated output use the caller's allocator; using one arena per
loaded run keeps lifetime ownership simple. Input strings and registry names
must remain alive for the run. The default instruction budget is 100,000 per
expression evaluation and machine stabilization is limited to 1,000 transitions.

Nested/parallel states, timers, actors, invocation, durable restoration,
collection bytecode, lambdas, spreads, and mutation bytecode are excluded.
Selecting a lone UTF-16 surrogate via string indexing is explicitly unsupported;
UTF-16 string length and BMP indexing are supported.

`zig build test` runs the focused registry unit test on supported toolchains.
Shared conformance fixtures exercise the executable against other runtimes.
