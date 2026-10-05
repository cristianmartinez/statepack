# Go runtime

A source-free Yexp bytecode VM and flat Statepack machine interpreter implementing
`statepack.native/1`. See [the shared contract](../CONTRACT.md) for its supported
execution profile and explicit exclusions.

Run `go test ./...` and `go build ./cmd/statepack` in this directory. The CLI reads
one JSON request from stdin and prints one JSON response. It supports expression,
machine, and capabilities requests.

Embedding uses `DefaultRegistry()` (a map of names to `Function` callbacks),
`Evaluate(expression, scope, registry)`, or `LoadMachine(artifact, registry)` then
`Start()`, `Send(event)`, and `Snapshot()`. Register a callback by assigning
`registry["name"] = func(args []any) (any, error) { ... }`. JSON numbers are
`float64`; use `Decode` or `encoding/json` to load artifacts. Registered functions
override built-ins and must return finite JSON values. Callbacks are pure,
synchronous computation; external effects are returned separately in snapshots.

Snapshots describe observable execution state; durable restoration is outside
this initial profile. Each event has a bounded stabilization loop, and each
expression evaluation has an instruction budget. Unsupported bytecode and machine
features fail explicitly. Native string indexing cannot return isolated UTF-16
surrogate units; those accesses fail with `UNSUPPORTED_FEATURE`.
