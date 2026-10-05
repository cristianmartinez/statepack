# Native runtime contract: statepack.native/1

This is the initial shared execution profile for JavaScript, Rust, Go, and Zig.
All runtimes run actual Yexp bytecode version 1 from Statepack compiled JSON,
without a source parser/compiler. Unsupported features MUST fail explicitly;
this profile is not a claim of full Yexp or full statechart coverage.

## Executable CLI contract

Each runtime reads one JSON request from stdin and writes one JSON response to
stdout (no logs on stdout). Request modes:

- `{"mode":"expression","expression":<Yexp envelope>,"scope":<JSON object>}`
- `{"mode":"machine","artifact":<Statepack artifact>,"events":[<event objects>]}`
- `{"mode":"capabilities"}`

Success expression: `{"value":<JSON>}`.
Success machine: `{"state":<string>,"done":<boolean>,"store":{slice:context},"queries":{slice:{name:value}},"effects":[{"type":...,"params":...}]}`.
Failure: `{"error":{"code":<stable code>,"message":<human detail>}}`.
Registry diagnostic CLI option: request `"registry":{"double":"double"}` maps
function name `double` to the deterministic host test function `number * 2`.
It overrides standard names when registered. Embedders expose a native function
registry API, not just this diagnostic mapping.

Error codes: TYPE_ERROR, DIVISION_BY_ZERO, INVALID_INSTRUCTION,
INVALID_ARTIFACT, UNSUPPORTED_FEATURE, UNKNOWN_FUNCTION, LIMIT_EXCEEDED.
Validation/evaluation must return errors rather than panic/crash. Finite JSON
numbers only; arithmetic is f64. Budgets default to 100000 VM instructions and
1000 machine/internal transitions. Registry functions are synchronous pure
calls, `(arguments: JSON[]) -> JSON or error`; host effects are distinct.

## Shared expression primitives

Supported opcodes:
0 CONST, 1 LOAD, 2 DUP, 3 POP;
10 ADD,11 SUB,12 MUL,13 DIV,14 MOD,15 NEG,20 TO_STRING;
30 EQ,31 NEQ,32 LT,33 GT,34 LTE,35 GTE,36 STRICT_EQ,37 STRICT_NEQ;
40..43 range checks;50..57 fused comparisons;60..64 fused arithmetic;
70 INCREMENT,71 DECREMENT,80..83 null/truthiness checks;
90 NOT,91 JUMP_IF_FALSE,92 JUMP_IF_TRUE,93 JUMP;
100 MAKE_ARRAY,101 MAKE_OBJ,110 INDEX,111 OPTIONAL_INDEX,
116 OPTIONAL_CHAIN_GET,117 OPTIONAL_CHAIN_INDEX;130 CALL;200 RETURN.

Reject all other opcodes (including spreads, wildcards, descent, and mutation),
lambda constants, and nonfinite numbers as UNSUPPORTED_FEATURE or INVALID_ARTIFACT.
Validate versions, instruction arity, slot/constant references, and jump targets.
A static index operand -1 means dynamic index (popped from the stack) in upstream
Yexp. LOAD slot paths support `$`, `$context`, `$env`, dot properties, bracket
numeric indices, arrays with `.length`, and negative indices. Missing paths are
null. `$` is the whole supplied scope; `$context`/$env are null in Statepack's
profile. No legacy state/data overload. Dangerous property keys __proto__,
prototype, constructor resolve null.

Only null/false are falsy. ADD supports number+number or string+string.
No type coercion in equality. Compare scalar values only; array/object equality
is UNSUPPORTED_FEATURE until identity semantics are implemented consistently.
String length uses UTF-16 code units. Interoperable strings must contain Unicode
scalar values; indexing a surrogate unit returns UNSUPPORTED_FEATURE. Ordered expression comparisons require numbers (matching current Yexp VM).
Guard comparisons separately support matching strings. Arrays/objects constructed on the VM stack preserve
JSON shape. TO_STRING uses JS String conversion for JSON values (null -> "null",
object -> "[object Object]", array -> comma-joined string, null elements empty).

Registry default primitives (fixed names, matching Yexp):
`length`, `abs`, `floor`, `ceil`, `round`, `min`, `max`, `toString`.
Unknown function names are UNKNOWN_FUNCTION; never ambient lookup or I/O.
Host registrations override standard functions. Empty min/max are TYPE_ERROR.
Unary defaults require exactly one argument; round accepts one or two, and
min/max require at least one. Host overrides define their own signatures.
round follows JS Math.round (ties toward positive infinity), optional decimals.
Each runtime rejects unsupported bytecode/functions during validation, before
machine execution; registered functions are considered during validation.

## Shared machine primitives

Load statepack.compiled format version 1, Yexp engine, expression artifact 1.
Flat atomic/final states with initial state, per-state `on`, root `on`, arrays
of guarded transitions (first match), string targets, entry/exit, named actions,
and mutation actions. On transition with target: exit actions, transition
actions, set state/done, entry actions. Target-less transitions only run actions.
`internal:true` skips exit/entry. Root on is fallback after state on. Initial
entry runs with `{"type":"xstate.init"}`. `always` transitions supported with
a bounded stabilization loop; final done is determined by state type.

Mutation action names/payloads are literal. Require slice prefix when >1 slice;
merge payload into event. Evaluate all mutation fields against one pre-mutation
slice snapshot then commit simultaneously. Scope has `context` (local slice,
including current queries), `event`, `queries`, `$context` (all slice contexts),
`$root` (all slice contexts). Queries derive from local context/queries and are
recomputed before/after events; dependency cycles must fail rather than loop.
Query values exposed separately and included in local expression context.

Effects: `log` and `host.event` resolve JSON values recursively through the
machine expression table then append `{type,params}`; params include `type` as
in the JavaScript reference. Expressions evaluated against `{context:<flat merged store data and queries>,event}`
for these effects (assign unsupported). Guard conditions use JS scalar truthiness
(0 and empty string are false), while Yexp uses its own truthiness rule. Guard
comparisons follow the current condition evaluator, including scalar coercion
for ==/!= and ordered scalar comparisons. Flat scope merges all contexts first,
then all queries, in artifact slice-table order; later fields win. Store snapshots exclude derived queries, which are returned separately.
Named action lookup resolves literals; cycle errors are LIMIT_EXCEEDED.

Guards: named guard references; `{condition:<condition>}`; `{and:[guards]}`,
`{or:[guards]}`, `{not:guard}`. Conditions support boolean, string truthy path,
`compare` using operands `{type:"ref",path:"context.foo"}` or JSON literals,
`and`/`or`/`not` (see current conditions schema for exact field names).

Fail during load for nested/parallel states, after/invoke, action types other
than mutation/log/host.event, unsupported guards/conditions, missing/duplicate
slice or expression tables, missing store expressions, unknown transition
states, unknown named actions/mutations, unsupported sources, and invalid
versions. Do not ignore unknown executable fields. meta is allowed and ignored.
Timers, actors, async invocation, durable snapshots and full collection builtins
are outside this initial profile. These exclusions must be documented in the
capabilities response.

## Implementation ownership

Rust: runtimes/rust/**. Go: runtimes/go/**. Zig: runtimes/zig/**.
Coordinator: shared contract/fixtures, JS registry adapter/reference runner,
conformance orchestration, docs, package scripts, and integration verification.
