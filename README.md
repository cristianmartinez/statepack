# Ouni State Machine

A TypeScript state machine runtime with JSON definitions, JSONata expressions,
and signal-backed data stores.

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
and interpreter instances are runtime objects.
