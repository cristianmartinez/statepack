# @ouni/conditions

JSON-based condition evaluation for the Ouni block framework.

## Installation

```bash
bun add @ouni/conditions
```

## Usage

Conditions are JSON objects that evaluate to boolean values against a scope.

```typescript
import { evaluate } from "@ouni/conditions";

const scope = {
  context: { user: { age: 25, name: "Alice" } }
};

// Simple truthy check (string shorthand)
evaluate("context.user.name", scope);  // true

// Comparison
evaluate({
  type: "compare",
  op: ">=",
  left: { type: "ref", path: "context.user.age" },
  right: 18
}, scope);  // true

// Logical AND
evaluate({
  type: "and",
  conditions: [
    "context.user.name",
    { type: "compare", op: ">", left: { type: "ref", path: "context.user.age" }, right: 0 }
  ]
}, scope);  // true
```

## Condition Types

### Shorthand

```typescript
// String: truthy check on path
"context.user.name"

// Boolean: literal value
true
false
```

### Truthy Check

```typescript
{ type: "truthy", path: "context.user.name" }
{ type: "truthy", path: "context.user.avatar", optional: true }
```

### Comparison

```typescript
{
  type: "compare",
  op: "===",  // "===", "!==", ">", ">=", "<", "<=", "==", "!="
  left: { type: "ref", path: "context.count" },
  right: 10
}
```

### Logical Operators

```typescript
// AND - all conditions must be true
{ type: "and", conditions: ["context.a", "context.b"] }

// OR - at least one condition must be true
{ type: "or", conditions: ["context.a", "context.b"] }

// NOT - inverts the condition
{ type: "not", condition: "context.disabled" }
```

### Value Checks

```typescript
{ type: "isDefined", path: "context.user" }
{ type: "isNull", path: "context.value" }
{ type: "isEmpty", path: "context.items" }
{ type: "isNotEmpty", path: "context.items" }
```

### Pattern Matching

```typescript
{
  type: "match",
  value: { type: "ref", path: "context.status" },
  cases: {
    "active": true,
    "pending": { type: "compare", op: ">", left: { type: "ref", path: "context.retries" }, right: 0 },
    "inactive": false
  },
  default: false
}
```

### State Machine Integration

```typescript
// Check if state matches
{ type: "state", matches: "loading" }
{ type: "state", matches: "form.editing" }

// Check if state has tag
{ type: "state", hasTag: "busy" }
```

### Functions

```typescript
{
  type: "fn",
  name: "includes",
  args: [
    { type: "ref", path: "context.roles" },
    "admin"
  ]
}
```

## Built-in Functions

### Array Functions
- `includes(array, item)` - Check if array contains item
- `length(array|string)` - Get length
- `some(array, property)` - Check if any item has truthy property
- `every(array, property)` - Check if all items have truthy property
- `none(array, property)` - Check if no items have truthy property
- `count(array, property?)` - Count items (optionally with truthy property)

### String Functions
- `startsWith(string, prefix)` - Check if string starts with prefix
- `endsWith(string, suffix)` - Check if string ends with suffix
- `contains(string, substring)` - Check if string contains substring
- `matches(string, pattern)` - Check if string matches regex pattern

### Number Functions
- `between(number, min, max)` - Check if number is in range (inclusive)

### Value Functions
- `isEmpty(value)` - Check if value is empty (null, undefined, empty string/array/object)
- `isDefined(value)` - Check if value is not null/undefined

### Date Functions
- `isPast(timestamp)` - Check if date is in the past
- `isFuture(timestamp)` - Check if date is in the future
- `isToday(timestamp)` - Check if date is today

## API Reference

### `evaluate(condition, scope, options?): boolean`

Evaluates a condition against a scope object.

### `createEvaluator(options): (condition, scope) => boolean`

Creates an evaluator with preset options (custom functions, named conditions).

### Scope Properties

- `context` - Application state
- `params` - URL or route parameters
- `event` - Current event data
- `item` - Current item in repeat/list context
- `index` - Current index in repeat/list context
- `state` - State machine state (value, tags, matches function)

### Options

- `namedConditions` - Map of reusable named conditions
- `functions` - Custom function implementations
