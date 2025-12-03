import { type Static, Type } from "@sinclair/typebox";

/**
 * Simple Guard Schema (inline guards use condition, compound use and/or/not)
 * Note: Recursive guards are validated at runtime, not compile time
 */
export const GuardSchema = Type.Union([
  Type.String(), // Reference to named guard
  Type.Object({
    condition: Type.String(), // Expression to evaluate
  }),
  Type.Object({
    and: Type.Array(Type.Union([Type.String(), Type.Any()])), // Array of guards
  }),
  Type.Object({
    or: Type.Array(Type.Union([Type.String(), Type.Any()])), // Array of guards
  }),
  Type.Object({
    not: Type.Union([Type.String(), Type.Any()]), // Nested guard
  }),
]);

/**
 * Action Schema - side effects during transitions
 */
export const ActionSchema = Type.Union([
  Type.String(), // Reference to named action
  Type.Object({
    type: Type.Literal("assign"),
    values: Type.Record(Type.String(), Type.Unknown()),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("send"),
    event: Type.String(),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    delay: Type.Optional(Type.Number()),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("raise"),
    event: Type.String(),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("log"),
    message: Type.String(),
    level: Type.Optional(
      Type.Union([
        Type.Literal("debug"),
        Type.Literal("info"),
        Type.Literal("warn"),
        Type.Literal("error"),
      ])
    ),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("navigate"),
    screen: Type.String(),
    params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    transition: Type.Optional(
      Type.Union([
        Type.Literal("push"),
        Type.Literal("replace"),
        Type.Literal("modal"),
        Type.Literal("fade"),
      ])
    ),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("back"),
    fallback: Type.Optional(Type.String()),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("fetch"),
    id: Type.Optional(Type.String()),
    url: Type.String(),
    method: Type.Optional(
      Type.Union([
        Type.Literal("GET"),
        Type.Literal("POST"),
        Type.Literal("PUT"),
        Type.Literal("PATCH"),
        Type.Literal("DELETE"),
      ])
    ),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
    body: Type.Optional(Type.Unknown()),
    timeout: Type.Optional(Type.Number()),
    onSuccess: Type.Optional(
      Type.Object({
        event: Type.Optional(Type.String()),
        assign: Type.Optional(Type.Record(Type.String(), Type.String())),
      })
    ),
    onError: Type.Optional(
      Type.Object({
        event: Type.Optional(Type.String()),
        assign: Type.Optional(Type.Record(Type.String(), Type.String())),
      })
    ),
    debounce: Type.Optional(Type.Number()),
    throttle: Type.Optional(Type.Number()),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("storage.get"),
    key: Type.String(),
    default: Type.Optional(Type.Unknown()),
    assign: Type.String(),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("storage.set"),
    key: Type.String(),
    value: Type.Unknown(),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("storage.remove"),
    key: Type.String(),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("toast"),
    message: Type.String(),
    variant: Type.Optional(
      Type.Union([Type.Literal("default"), Type.Literal("success"), Type.Literal("error")])
    ),
    duration: Type.Optional(Type.Number()),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("haptic"),
    style: Type.Union([
      Type.Literal("impact"),
      Type.Literal("notification"),
      Type.Literal("selection"),
    ]),
    intensity: Type.Optional(
      Type.Union([Type.Literal("light"), Type.Literal("medium"), Type.Literal("heavy")])
    ),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("clipboard"),
    text: Type.String(),
    onSuccess: Type.Optional(Type.Unknown()), // Nested action
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("focus"),
    target: Type.String(),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("host.event"),
    name: Type.String(),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("host.close"),
    result: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("host.analytics"),
    event: Type.String(),
    properties: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("conditional"),
    condition: Type.String(),
    then: Type.Array(Type.Unknown()), // Nested actions
    else: Type.Optional(Type.Array(Type.Unknown())),
  }),
  Type.Object({
    type: Type.Literal("transform"),
    input: Type.String(),
    operation: Type.Union([
      Type.Literal("filter"),
      Type.Literal("map"),
      Type.Literal("sort"),
      Type.Literal("find"),
      Type.Literal("slice"),
      Type.Literal("concat"),
      Type.Literal("unique"),
      Type.Literal("groupBy"),
      Type.Literal("sum"),
      Type.Literal("count"),
    ]),
    params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    output: Type.String(),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("spawn"),
    machine: Type.String(),
    id: Type.String(),
    input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("sendTo"),
    to: Type.String(),
    event: Type.String(),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    condition: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("stop"),
    actor: Type.String(),
    condition: Type.Optional(Type.String()),
  }),
]);

export type Action = Static<typeof ActionSchema>;

/**
 * Actions can be a single action or array of actions
 */
export const ActionsSchema = Type.Union([ActionSchema, Type.Array(ActionSchema)]);

export type Actions = Static<typeof ActionsSchema>;

/**
 * Transition Schema - what happens when an event occurs
 */
export const TransitionSchema = Type.Union([
  Type.String(), // Simple target state
  Type.Object({
    target: Type.Optional(Type.String()),
    actions: Type.Optional(ActionsSchema),
    guard: Type.Optional(GuardSchema),
    internal: Type.Optional(Type.Boolean()),
  }),
]);

export type Transition = Static<typeof TransitionSchema>;

/**
 * Transitions can be a single transition or array (first match wins)
 */
export const TransitionsSchema = Type.Union([TransitionSchema, Type.Array(TransitionSchema)]);

export type Transitions = Static<typeof TransitionsSchema>;

/**
 * Invoke Schema - for invoking services (like fetch)
 */
export const InvokeSchema = Type.Object({
  id: Type.Optional(Type.String()),
  src: Type.Union([
    Type.String(),
    Type.Object({
      type: Type.Literal("fetch"),
      url: Type.String(),
      method: Type.Optional(Type.String()),
      headers: Type.Optional(Type.Record(Type.String(), Type.String())),
      body: Type.Optional(Type.Unknown()),
    }),
  ]),
  onDone: Type.Optional(TransitionSchema),
  onError: Type.Optional(TransitionSchema),
});

export type Invoke = Static<typeof InvokeSchema>;

/**
 * State Node Schema
 */
export const StateNodeSchema = Type.Recursive(
  (Self) =>
    Type.Object({
      id: Type.Optional(Type.String()),
      type: Type.Optional(
        Type.Union([
          Type.Literal("atomic"),
          Type.Literal("compound"),
          Type.Literal("parallel"),
          Type.Literal("final"),
        ])
      ),
      initial: Type.Optional(Type.String()),
      entry: Type.Optional(ActionsSchema),
      exit: Type.Optional(ActionsSchema),
      on: Type.Optional(Type.Record(Type.String(), TransitionsSchema)),
      after: Type.Optional(Type.Record(Type.String(), TransitionsSchema)),
      always: Type.Optional(Type.Array(TransitionSchema)),
      invoke: Type.Optional(Type.Union([InvokeSchema, Type.Array(InvokeSchema)])),
      states: Type.Optional(Type.Record(Type.String(), Self)),
      meta: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
  { $id: "StateNode" }
);

export type StateNode = Static<typeof StateNodeSchema>;

/**
 * Guard Definition Schema
 */
export const GuardDefinitionSchema = Type.Object({
  condition: Type.String(),
});

export type GuardDefinition = Static<typeof GuardDefinitionSchema>;

/**
 * Machine Schema - the complete state machine definition
 */
export const MachineSchema = Type.Object({
  id: Type.String(),
  initial: Type.String(),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  states: Type.Record(Type.String(), StateNodeSchema),
  on: Type.Optional(Type.Record(Type.String(), TransitionsSchema)), // Global handlers
  guards: Type.Optional(Type.Record(Type.String(), GuardDefinitionSchema)),
  actions: Type.Optional(
    Type.Record(Type.String(), Type.Union([ActionSchema, Type.Array(ActionSchema)]))
  ),
});

export type Machine = Static<typeof MachineSchema>;

/**
 * Mini-App Definition Schema - includes machine and named definitions
 */
export const MiniAppSchema = Type.Object({
  machine: MachineSchema,
  guards: Type.Optional(Type.Record(Type.String(), GuardDefinitionSchema)),
  actions: Type.Optional(
    Type.Record(Type.String(), Type.Union([ActionSchema, Type.Array(ActionSchema)]))
  ),
});

export type MiniApp = Static<typeof MiniAppSchema>;
