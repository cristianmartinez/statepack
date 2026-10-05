# Statepack Rust runtime

Executes the `statepack.native/1` profile of compiled JSON machines and Yexp
bytecode v1. No parser or source compiler is included. See the shared
[contract](../CONTRACT.md) for supported semantics and explicit exclusions.

```sh
cargo test --manifest-path runtimes/rust/Cargo.toml
cargo run --quiet --manifest-path runtimes/rust/Cargo.toml < request.json
```

The CLI reads one JSON request from stdin and writes one JSON response. Modes
are `expression`, `machine`, and `capabilities`.

Embedding applications use `Registry::register` with pure synchronous callbacks,
`evaluate` for expression envelopes, or `Machine::load`, `send`, and `snapshot`.
Registrations override built-in names. Callbacks receive JSON arguments and
return `Result<serde_json::Value>`; effects are recorded separately in machine
snapshots for the host to handle.

VM execution is limited to 100,000 instructions per evaluation. Machines have
an accumulated budget of 1,000 transitions. Invalid programs return structured
errors. Nested/parallel states, timers, actors, async invocation, persisted
running snapshots, expression mutation, lambda/collection operations, assignment
and conditional actions are excluded from this initial profile.

Ordered expression comparisons require numbers, matching the JavaScript Yexp
VM. Machine guard comparisons retain the condition evaluator's scalar coercion.
String lengths count UTF-16 code units; indexing an isolated surrogate unit is
rejected because interoperable JSON values use Unicode scalar strings.
