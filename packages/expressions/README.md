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
