# Statepack

A TypeScript state machine runtime with JSON definitions, JSONata expressions,
and signal-backed data stores. [Rust, Go, and Zig execution runtimes](runtimes/README.md)
share an initial portable bytecode and machine profile.

## Development

```sh
bun install
bun run build
bun test
bun run typecheck
```

## Packages

| Package | Purpose |
| --- | --- |
| [state-machine](packages/state-machine/README.md) | Machine schemas, compilation, and interpretation |
| [expressions](packages/expressions/README.md) | JSONata compilation and evaluation |
| [conditions](packages/conditions/README.md) | JSON condition evaluation |
| data | Store slices, queries, mutations, and signals |

Machine definitions can be serialized as JSON. Compiled expressions, live signals,
and interpreter instances are runtime objects. Yexp machines can also be exported
as [portable compiled JSON artifacts](docs/compiled-artifacts.md).

## Protocol proposal

[RFC 0001: Statepack Protocol v1](docs/rfcs/0001-statepack-protocol.md) is the
draft proposal for the serializable language, headless runtime contract, and
instance persistence. Its proposed syntax is not yet supported by the runtime.

## Website

The [Astro website](website/README.md) includes a React playground that runs the
workspace runtime. After building the packages, use `bun run website:dev` for local
development or `bun run website:build` for the static production build.
