# @ouni/state-machine

XState-inspired declarative state machine for the Ouni block framework.

## Installation

```bash
bun add @ouni/state-machine
```

## Usage

```typescript
import { compileMachine, interpret, type Machine } from "@ouni/state-machine";

const machine: Machine = {
  id: "counter",
  initial: "idle",
  context: { count: 0 },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: {
            type: "assign",
            values: { count: "context.count + 1" }
          }
        },
        DECREMENT: {
          actions: {
            type: "assign",
            values: { count: "context.count - 1" }
          }
        }
      }
    }
  }
};

// Compile the machine (pre-compiles JSONata expressions)
const compiled = compileMachine(machine);

// Create an interpreter
const interpreter = interpret(compiled);

// Subscribe to state changes
interpreter.subscribe((state) => {
  console.log("State:", state.value, "Context:", state.context);
});

// Start the machine
await interpreter.start();

// Send events
await interpreter.send({ type: "INCREMENT" });
```

## Machine Definition

### Basic Structure

```typescript
const machine: Machine = {
  id: "myMachine",
  initial: "initialState",
  context: { /* initial context values */ },
  states: { /* state definitions */ },
  on: { /* global event handlers */ },
  guards: { /* named guard definitions */ },
  actions: { /* named action definitions */ }
};
```

### States

```typescript
states: {
  idle: {
    type: "atomic",  // "atomic" | "compound" | "parallel" | "final"
    entry: [...],    // Actions to run when entering
    exit: [...],     // Actions to run when exiting
    on: {
      EVENT_NAME: "targetState",  // Simple transition
      OTHER_EVENT: {              // Full transition object
        target: "targetState",
        actions: [...],
        guard: "guardName"
      }
    }
  },
  parent: {
    type: "compound",
    initial: "child1",
    states: {
      child1: { /* ... */ },
      child2: { /* ... */ }
    }
  }
}
```

### Transitions

```typescript
// String shorthand - just target state
on: { SUBMIT: "submitted" }

// Object with options
on: {
  SUBMIT: {
    target: "submitted",
    guard: "isValid",
    actions: [{ type: "assign", values: { submitted: true } }],
    internal: false  // Whether to re-enter current state
  }
}

// Array of transitions (first matching guard wins)
on: {
  SUBMIT: [
    { target: "error", guard: "hasErrors" },
    { target: "submitted" }
  ]
}
```

### Guards

Guards use `@ouni/conditions` JSON objects:

```typescript
guards: {
  isValid: {
    condition: {
      type: "and",
      conditions: [
        { type: "isNotEmpty", path: "context.name" },
        { type: "compare", op: ">=", left: { type: "ref", path: "context.age" }, right: 18 }
      ]
    }
  },
  hasItems: {
    condition: { type: "isNotEmpty", path: "context.items" }
  }
}
```

### Actions

#### Assign

```typescript
{
  type: "assign",
  values: {
    count: "context.count + 1",
    greeting: "'Hello, ' & event.name & '!'"
  }
}
```

Values use JSONata expressions for dynamic computation.

#### Send / Raise

```typescript
// Send to self (queued)
{ type: "send", event: "NEXT", delay: 1000 }

// Raise (immediate)
{ type: "raise", event: "SUCCESS", payload: { result: "event.data" } }
```

#### Navigate

```typescript
{ type: "navigate", screen: "details", params: { id: "context.selectedId" } }
{ type: "back", fallback: "home" }
```

#### Fetch

```typescript
{
  type: "fetch",
  url: "'https://api.example.com/users/' & context.userId",
  method: "GET",
  onSuccess: { event: "LOAD_SUCCESS", assign: { user: "response" } },
  onError: { event: "LOAD_ERROR", assign: { error: "response.message" } }
}
```

#### Storage

```typescript
{ type: "storage.get", key: "auth_token", assign: "context.token", default: null }
{ type: "storage.set", key: "auth_token", value: "context.token" }
{ type: "storage.remove", key: "auth_token" }
```

#### UI Actions

```typescript
{ type: "toast", message: "'Saved successfully'", variant: "success" }
{ type: "haptic", style: "notification", intensity: "light" }
{ type: "clipboard", text: "context.shareUrl" }
{ type: "focus", target: "emailInput" }
```

#### Conditional

```typescript
{
  type: "conditional",
  condition: "context.count > 10",
  then: [{ type: "assign", values: { overflow: true } }],
  else: [{ type: "assign", values: { overflow: false } }]
}
```

#### Host Communication

```typescript
{ type: "host.event", name: "formSubmitted", data: { values: "context.form" } }
{ type: "host.close", result: { success: true } }
{ type: "host.analytics", event: "button_clicked", properties: { id: "context.buttonId" } }
```

### Delayed Transitions

```typescript
states: {
  loading: {
    after: {
      3000: "timeout"  // Transition after 3 seconds
    }
  }
}
```

### Invoke (Services)

```typescript
states: {
  loading: {
    invoke: {
      src: {
        type: "fetch",
        url: "https://api.example.com/data"
      },
      onDone: { target: "success", actions: { type: "assign", values: { data: "event.data" } } },
      onError: "error"
    }
  }
}
```

## API Reference

### Compiler

#### `compileMachine(machine: Machine): CompiledMachine`

Pre-compiles all JSONata expressions in the machine for efficient evaluation.

### Interpreter

#### `interpret(machine, options?): Interpreter`

Creates a new interpreter instance.

#### `interpreter.start(): Promise<void>`

Starts the machine and enters the initial state.

#### `interpreter.send(event): Promise<void>`

Sends an event to the machine.

#### `interpreter.subscribe(listener): () => void`

Subscribes to state changes. Returns unsubscribe function.

#### `interpreter.getState(): State`

Gets the current state.

### State Utilities

#### `matchesState(state, pattern): boolean`

Check if state matches a pattern (supports hierarchical matching).

#### `toStateString(state): string`

Convert state value to dot-notation string.

### Validation

#### `validateMachine(machine): ValidationResult`

Validates a machine definition against the schema.

#### `isMachine(value): value is Machine`

Type guard to check if value is a valid machine.
