# @ouni/expressions

JSONata-based expression evaluation for the Ouni block framework.

## Installation

```bash
bun add @ouni/expressions
```

## Usage

Expressions use [JSONata](https://jsonata.org/) syntax for querying and transforming data.

### Compile Once, Evaluate Many

For best performance, compile expressions once and reuse them:

```typescript
import { compileExpression, evaluateCompiled } from "@ouni/expressions";

// Compile once
const compiled = compileExpression("user.name");

// Evaluate many times with different scopes
const name1 = await evaluateCompiled(compiled, { user: { name: "Alice" } });
const name2 = await evaluateCompiled(compiled, { user: { name: "Bob" } });
```

### Expression Examples

```typescript
// Simple path access
compileExpression("context.count")

// Arithmetic
compileExpression("context.count + 1")

// String concatenation
compileExpression("'Hello, ' & user.name & '!'")

// JSONata functions
compileExpression("$uppercase(user.name)")
compileExpression("$substring(text, 0, 10)")

// Array operations
compileExpression("items[status = 'active']")
compileExpression("$sum(items.price)")
compileExpression("$count(items)")
```

### Path Utilities

```typescript
import { getPath, setPath, resolveFromScope } from "@ouni/expressions";

// Get nested value
const value = getPath({ user: { name: "Alice" } }, "user.name");
// => "Alice"

// Set nested value (immutable)
const updated = setPath({ user: { name: "Alice" } }, "user.name", "Bob");
// => { user: { name: "Bob" } }
```

## API Reference

### `compileExpression(expression: string): CompiledJSONataExpression`

Compiles a JSONata expression string into an AST for efficient repeated evaluation.

### `evaluateCompiled(compiled, scope, options?): Promise<unknown>`

Evaluates a compiled expression against a scope object. Returns a Promise since JSONata evaluation is async.

### `getPath(obj, path): unknown`

Gets a value from an object using dot notation path.

### `setPath(obj, path, value): object`

Returns a new object with the value set at the given path (immutable).

## JSONata Reference

This package uses JSONata v2.x. See the [JSONata documentation](https://docs.jsonata.org/) for the full expression syntax including:

- Path expressions: `account.name`
- Predicates: `items[price > 100]`
- Functions: `$sum()`, `$count()`, `$uppercase()`, etc.
- String concatenation: `firstName & ' ' & lastName`
- Conditionals: `price > 100 ? 'expensive' : 'cheap'`
