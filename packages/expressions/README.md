# @statepack/expressions

Compiles JSONata expressions and evaluates them against a scope. Evaluation is
asynchronous; compiled expressions can be reused with different inputs.

```typescript
import { compileExpression, evaluateCompiled } from "@statepack/expressions";

const compiled = compileExpression("context.count + 1");
const result = await evaluateCompiled(compiled, { context: { count: 2 } });
console.log(result); // 3
```

`compileExpression` also extracts dependency paths for reactive bindings.
`getPath`, `setPath`, and `resolveFromScope` provide path access utilities.

See [compile.ts](src/compile.ts) for compilation and dependency extraction,
[evaluate.ts](src/evaluate.ts) for scope evaluation, and the
[JSONata reference](https://docs.jsonata.org/) for expression syntax.

## Expression engines

JSONata remains the default for existing definitions. Select Yexp explicitly to
compile a JSON-serializable bytecode artifact:

```typescript
import { compileWithEngine, evaluateCompiled } from "@statepack/expressions";

const compiled = compileWithEngine("$.context.count + $.event.amount", {
  engine: "yexp",
});
const loaded = JSON.parse(JSON.stringify(compiled));
console.log(await evaluateCompiled(loaded, {
  context: { count: 2 },
  event: { amount: 3 },
})); // 5
```

`jsonataEngine` and `yexpEngine` implement the `ExpressionEngine` adapter contract.
Yexp artifacts contain `engine`, `artifactVersion`, optional `source`, and the
upstream `program` (including its bytecode version). Execution does not require
source. JSONata compiled objects remain runtime-only objects.

For Yexp, `$` is the complete Statepack evaluation scope. Use `$.context`,
`$.event`, and other explicit scope properties; this adapter does not bind
Yexp's `$context` or `$env` roots. Missing runtime values (`undefined`, including
pending query results) become `null`. Evaluation clones its input to prevent
Yexp mutation operations from modifying host state. VM errors reject the
promise, and top-level lambda results are rejected.

This initial adapter uses Yexp 0.0.1 and bytecode version 1. Imported programs
must be trusted compiler output: version checks are not a bytecode verifier or
an execution budget. The adapter retains upstream built-ins, including time and
randomness; a deterministic portable profile is not yet defined. Cross-language
VM conformance and an execution-only distribution remain future work.

## Host function registry

Use `createPrimitiveRegistry()` for the eight deterministic functions shared by
[the native runtime profile](../../runtimes/README.md), then `register(name, fn)`
to add or override pure functions. Pass `{ functions: registry }` as the third
argument to `evaluateCompiled`, or pass `expressionFunctions: registry` to the
machine interpreter. Functions are runtime capabilities and are not serialized.
