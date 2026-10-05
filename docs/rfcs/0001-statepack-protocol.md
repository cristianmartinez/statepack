# RFC 0001: Statepack Protocol v1

- Status: Draft
- Created: 2026-10-05
- Proposed protocol identifier: `statepack/1`
- Scope: Machine definitions, headless execution, host interaction, and persistence

## Summary

Define Statepack as a declarative language for application behavior. A machine describes states, events, data, transitions, and external operations. A headless runtime executes the definition; a host supplies external capabilities and can render state through any interface.

This RFC is a proposal for discussion. It does not establish an accepted specification or change the current API. Proposed syntax below is not currently executable.

## Motivation and use cases

JSON serialization alone does not establish a portable language. Implementations need agreement on expression evaluation, transition ordering, external operations, errors, and restoration.

The intended use cases are driving interfaces from machines, running the same behavior in servers and tests, and exchanging definitions without executable host code. Durable instance restoration is a proposed use case whose scope remains unresolved.

## Existing foundation

- [Machine schemas](../../packages/state-machine/src/schema/types.ts) define states, transitions, guards, actions, timers, and invocations.
- [Data schemas](../../packages/data/src/schema/store.ts) define named slices with context, queries, mutations, and sources.
- [Expressions](../../packages/expressions/README.md) use JSONata.
- [Conditions](../../packages/conditions/README.md) provide structured predicates.
- [The interpreter](../../packages/state-machine/src/interpreter/interpreter.ts) exposes signals, event dispatch, an external-effect callback, and `getSnapshot()`.

The action schema includes environment-specific operations such as navigation, toasts, and haptics. The snapshot method is an observation API; its existence does not establish a durable restore contract. Some schema fields accept arbitrary values, so schema acceptance alone does not guarantee JSON serializability.

## Three contracts

| Contract | Responsibility |
| --- | --- |
| Definition | Initial data, states, events, transitions, expressions, and capabilities |
| Runtime protocol | Event input, observations, effect requests, completion, and errors |
| Snapshot | Saved instance state and conditions for restoration |

Protocol version, definition revision, and runtime package version serve different purposes. They identify interpretation rules, the behavior used by an instance, and an implementation release respectively.

## Proposed principles

1. JSON is the canonical interchange format. Future authoring syntaxes compile to the same contract.
2. Definitions contain JSON values and declared expressions, without closures, live signals, compiled expressions, or host handles.
3. External behavior uses named host capabilities.
4. Expressions have explicit syntax so literal strings remain unambiguous.
5. Execution ordering and failure behavior are specified explicitly.
6. Persistence describes pending work without assuming external operations can safely be repeated.

## Proposed definition language

This candidate shape illustrates the proposal. The simplified `data` field does not settle whether existing named store slices should be replaced.

```json
{
  "protocol": "statepack/1",
  "id": "checkout",
  "initial": "editing",
  "data": {
    "order": { "items": [], "receipt": null }
  },
  "states": {
    "editing": {
      "on": {
        "SUBMIT": {
          "target": "submitting",
          "guard": { "expr": "$count(data.order.items) > 0" }
        }
      }
    },
    "submitting": {
      "invoke": {
        "id": "submitOrder",
        "capability": "orders.submit",
        "input": { "expr": "data.order" },
        "onDone": {
          "target": "complete",
          "assign": {
            "order.receipt": { "expr": "event.output" }
          }
        },
        "onError": { "target": "editing" }
      }
    },
    "complete": { "type": "final" }
  }
}
```

### Core vocabulary

| Primitive | Meaning |
| --- | --- |
| State | A behavior node; v1 support for hierarchy and parallel states remains unresolved |
| Event | A named input with JSON payload |
| Transition | A guarded response with an optional target and data changes |
| Expression | A calculation evaluated against a defined scope |
| Mutation | A declared data update; relationship to inline assignment remains unresolved |
| Capability | A host-provided operation identified by name |
| Invocation | An external operation whose lifetime belongs to a state |
| Snapshot | A versioned representation of an instance at a stable boundary |

### Expressions and values

Recommend retaining JSONata with explicit wrappers such as `{ "expr": "data.order" }`. The specification must define where wrappers are recognized, how literal objects with an `expr` property are represented, whether nested inputs are evaluated recursively, and the available scope.

Time, randomness, generated identifiers, and custom functions require an explicit policy. JSONata support alone does not guarantee deterministic evaluation. Whether structured conditions remain a canonical guard form is unresolved.

### Host capabilities

Recommend capability names such as `orders.submit`, `storage.read`, and `navigation.open`. Hosts resolve these names to implementations. Definitions should declare required capabilities so unsupported machines can be rejected before execution.

The protocol must distinguish a definition's invocation identifier from the unique identity of each operation attempt. Results must be correlated with the correct attempt, including after a state is exited and reentered. Cancellation and late completion need explicit rules.

## Execution rules to resolve

Before acceptance, specify:

- Event ordering, concurrent sends, and internal versus external event queues.
- Transition selection, guard order, and hierarchical precedence.
- Exit, mutation, entry, invocation, and immediate-transition ordering.
- Data visibility between actions and atomicity of updates.
- Stable observation boundaries and protection against immediate-transition loops.
- Unhandled events, invalid targets, expression failures, and capability failures.
- Cancellation, late results, and final-state behavior.
- Timer units, clock ownership, and restoration behavior.

These are requirements to resolve, not claims about existing implementation behavior.

## Snapshot and recovery proposal

Definition serialization and instance restoration are separate guarantees. If durable restoration enters v1, snapshots should identify the protocol version, definition revision, instance, active state configuration, stored data, and pending work. Queues and timers need inclusion or explicit restrictions on when snapshots can be taken.

Recommend snapshots at documented stable boundaries. Restoration should not silently repeat pending external operations. Hosts need a reconciliation policy: recover a result, safely retry with an idempotency key, or report that intervention is required.

The protocol must not promise exactly-once external effects without an end-to-end mechanism. Replaying state changes and repeating host effects require separate policies.

## Decision ledger

All decisions below are unresolved. Recommendations are proposals, not confirmed user decisions.

| Decision | Recommendation | Consequence |
| --- | --- | --- |
| Definition only or durable instances in v1? | Define both contracts and bound restoration | Adds pending-work and compatibility requirements |
| External operations through capabilities? | Yes | Environment-specific adapters belong to hosts |
| Retain JSONata with explicit wrappers? | Yes | Requires scope and literal-escape rules |
| Reconcile pending effects on restoration? | Yes | Requires operation identities and host participation |
| Preserve named slices, queries, and mutations? | Prefer preserving existing concepts pending discussion | Avoids an unexplained data-model replacement |
| Structured conditions alongside expressions? | Evaluate before acceptance | Affects tooling and canonical representation |
| Full statechart features in v1? | Choose an explicit supported subset | Schema presence must not imply runtime conformance |
| Event and capability input/output schemas? | Declare validation contracts | Enables earlier errors and compatibility checks |
| Runtime message transport? | Keep semantics transport independent | Local and remote interfaces can share semantics |
| Existing definitions and migration? | Specify migration before changing schemas | Prevents silent reinterpretation |

## Alternatives

- Adopt the existing schema unchanged: fastest, but preserves host-specific vocabulary and incomplete execution and persistence guarantees.
- Create a textual DSL first: adds authoring flexibility, but requires parser and tooling work before semantics are settled.
- Embed JavaScript callbacks: flexible for one host, but conflicts with portable JSON definitions and independent inspection.

## Proposed version-one boundaries

Non-goals are UI rendering, bundling host implementations into definitions, arbitrary embedded JavaScript, a custom textual parser, and a claim of exactly-once distributed execution.

Actors, distributed coordination, history states, and replay tooling need explicit include/defer decisions. Existing related action names do not establish these as protocol requirements.

## Acceptance and verification

Accept this RFC after decisions affecting v1 semantics are resolved or explicitly deferred, definition and runtime contracts have complete examples, and restoration guarantees are bounded precisely.

Conformance should be demonstrated through JSON round trips, validation, expression and ordering fixtures, capability completion/failure/cancellation cases, and recovery cases if included. A basic acceptance scenario is running the same definition with two host adapters without changing its behavior definition.

## Repository convention

RFCs use sequential four-digit filenames under `docs/rfcs/` and statuses Draft, Accepted, or Superseded. Superseded RFCs link to their replacements.

After acceptance, publish the normative contract in `docs/protocol/v1/specification.md` and validated examples under `docs/protocol/v1/examples/`. Declare MUST as required behavior, SHOULD as recommended behavior, and MAY as optional behavior. Track implementation coverage separately from normative requirements.

Align TypeScript/Zod schemas with the accepted contract and publish JSON Schema for editor and independent-runtime validation. Proposed examples become conformance fixtures only after syntax is accepted and supported.
