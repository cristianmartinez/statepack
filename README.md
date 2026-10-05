# Ouni State Machine

Standalone workspace for Ouni’s declarative, JSON-serializable state machine definitions.

## Get started

```sh
bun install
bun run build
bun test
bun run typecheck
```

## Packages

- `@ouni/state-machine`: schemas, compiler, interpreter, guards, and actions.
- `@ouni/expressions`: JSONata expression compilation and evaluation.
- `@ouni/conditions`: declarative JSON conditions.
- `@ouni/data`: data stores, queries, mutations, and reactive signals.

See [the state machine guide](packages/state-machine/README.md) for usage.

Machine definitions represent behavior as JSON objects and expression strings. Runtime interpreters, compiled expression objects, and live signals are separate from those serializable definitions.

## Source

Extracted from https://github.com/cristianmartinez/ouni at commit `9df2517e22a598791f5cf3291a36a3d12e5889ed`.
The UI renderer, React integration, and original demo apps are outside this workspace.
