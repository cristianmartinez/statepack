# @ouni/conditions

Evaluates JSON conditions against a scope and provides Zod schemas for validation.

```typescript
import { evaluate, type Condition } from "@ouni/conditions";

const condition: Condition = {
  type: "compare",
  op: ">=",
  left: { type: "ref", path: "context.age" },
  right: 18,
};

console.log(evaluate(condition, { context: { age: 25 } })); // true
```

Conditions include comparisons, `and`/`or`/`not`, truthiness, value checks,
case matching, named conditions, and state matching. A string is shorthand
for a truthy path check; a boolean is a literal condition.

`createEvaluator(options)` configures named conditions and custom functions.
See [schema.ts](src/schema.ts) for condition shapes and
[functions.ts](src/functions.ts) for built-in functions.
