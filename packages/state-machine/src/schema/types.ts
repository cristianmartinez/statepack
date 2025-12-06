import { ConditionSchema } from "@ouni/conditions";
import { StoreDefinitionSchema } from "@ouni/data";
import { z } from "zod";

/**
 * Simple Guard Schema (inline guards use condition, compound use and/or/not)
 * Note: Recursive guards are validated at runtime, not compile time
 * Guards now use Condition objects from @ouni/conditions instead of strings
 */
export const GuardSchema = z.union([
  z.string(), // Reference to named guard
  z.object({
    condition: ConditionSchema, // Condition object to evaluate
  }),
  z.object({
    and: z.array(z.union([z.string(), z.any()])), // Array of guards
  }),
  z.object({
    or: z.array(z.union([z.string(), z.any()])), // Array of guards
  }),
  z.object({
    not: z.union([z.string(), z.any()]), // Nested guard
  }),
]);

/**
 * Action Schema - side effects during transitions
 */
export const ActionSchema = z.union([
  z.string(), // Reference to named action
  z.object({
    type: z.literal("assign"),
    values: z.record(z.string(), z.unknown()),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("send"),
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
    delay: z.number().optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("raise"),
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("log"),
    message: z.string(),
    level: z
      .union([z.literal("debug"), z.literal("info"), z.literal("warn"), z.literal("error")])
      .optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("navigate"),
    screen: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
    transition: z
      .union([z.literal("push"), z.literal("replace"), z.literal("modal"), z.literal("fade")])
      .optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("back"),
    fallback: z.string().optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("fetch"),
    id: z.string().optional(),
    url: z.string(),
    method: z
      .union([
        z.literal("GET"),
        z.literal("POST"),
        z.literal("PUT"),
        z.literal("PATCH"),
        z.literal("DELETE"),
      ])
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    timeout: z.number().optional(),
    onSuccess: z
      .object({
        event: z.string().optional(),
        assign: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    onError: z
      .object({
        event: z.string().optional(),
        assign: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    debounce: z.number().optional(),
    throttle: z.number().optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("storage.get"),
    key: z.string(),
    default: z.unknown().optional(),
    assign: z.string(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("storage.set"),
    key: z.string(),
    value: z.unknown(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("storage.remove"),
    key: z.string(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("toast"),
    message: z.string(),
    variant: z.union([z.literal("default"), z.literal("success"), z.literal("error")]).optional(),
    duration: z.number().optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("haptic"),
    style: z.union([z.literal("impact"), z.literal("notification"), z.literal("selection")]),
    intensity: z.union([z.literal("light"), z.literal("medium"), z.literal("heavy")]).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("clipboard"),
    text: z.string(),
    onSuccess: z.unknown().optional(), // Nested action
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("focus"),
    target: z.string(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("host.event"),
    name: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("host.close"),
    result: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("host.analytics"),
    event: z.string(),
    properties: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("conditional"),
    condition: z.string(),
    then: z.array(z.unknown()), // Nested actions
    else: z.array(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("transform"),
    input: z.string(),
    operation: z.union([
      z.literal("filter"),
      z.literal("map"),
      z.literal("sort"),
      z.literal("find"),
      z.literal("slice"),
      z.literal("concat"),
      z.literal("unique"),
      z.literal("groupBy"),
      z.literal("sum"),
      z.literal("count"),
    ]),
    params: z.record(z.string(), z.unknown()).optional(),
    output: z.string(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("spawn"),
    machine: z.string(),
    id: z.string(),
    input: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("sendTo"),
    to: z.string(),
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("stop"),
    actor: z.string(),
    condition: z.string().optional(),
  }),
  z.object({
    type: z.literal("mutation"),
    name: z.string(), // Reference to mutation name in data definition
    payload: z.record(z.string(), z.unknown()).optional(), // Additional event payload
    condition: z.string().optional(),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

/**
 * Actions can be a single action or array of actions
 */
export const ActionsSchema = z.union([ActionSchema, z.array(ActionSchema)]);

export type Actions = z.infer<typeof ActionsSchema>;

/**
 * Transition Schema - what happens when an event occurs
 */
export const TransitionSchema = z.union([
  z.string(), // Simple target state
  z.object({
    target: z.string().optional(),
    actions: ActionsSchema.optional(),
    guard: GuardSchema.optional(),
    internal: z.boolean().optional(),
  }),
]);

export type Transition = z.infer<typeof TransitionSchema>;

/**
 * Transitions can be a single transition or array (first match wins)
 */
export const TransitionsSchema = z.union([TransitionSchema, z.array(TransitionSchema)]);

export type Transitions = z.infer<typeof TransitionsSchema>;

/**
 * Invoke Source Schema - different types of services that can be invoked
 */
export const InvokeSourceSchema = z.union([
  z.string(), // Reference to named service
  z.object({
    type: z.literal("fetch"),
    url: z.string(),
    method: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("interval"),
    ms: z.number(), // Interval in milliseconds
    event: z.string(), // Event to send on each tick
  }),
  z.object({
    type: z.literal("timeout"),
    ms: z.number(), // Delay in milliseconds
    event: z.string(), // Event to send after delay
  }),
]);

export type InvokeSource = z.infer<typeof InvokeSourceSchema>;

/**
 * Invoke Schema - for invoking services (like fetch, intervals, timeouts)
 */
export const InvokeSchema = z.object({
  id: z.string().optional(),
  src: InvokeSourceSchema,
  onDone: TransitionSchema.optional(),
  onError: TransitionSchema.optional(),
});

export type Invoke = z.infer<typeof InvokeSchema>;

/**
 * State Node Schema - recursive type for nested states
 */
// Define the StateNode type interface first for recursive reference
export interface StateNode {
  id?: string;
  type?: "atomic" | "compound" | "parallel" | "final";
  initial?: string;
  entry?: Actions;
  exit?: Actions;
  on?: Record<string, Transitions>;
  after?: Record<string, Transitions>;
  always?: Transition[];
  invoke?: Invoke | Invoke[];
  states?: Record<string, StateNode>;
  meta?: Record<string, unknown>;
}

// Create the schema with lazy evaluation for recursion
export const StateNodeSchema: z.ZodType<StateNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    type: z
      .union([
        z.literal("atomic"),
        z.literal("compound"),
        z.literal("parallel"),
        z.literal("final"),
      ])
      .optional(),
    initial: z.string().optional(),
    entry: ActionsSchema.optional(),
    exit: ActionsSchema.optional(),
    on: z.record(z.string(), TransitionsSchema).optional(),
    after: z.record(z.string(), TransitionsSchema).optional(),
    always: z.array(TransitionSchema).optional(),
    invoke: z.union([InvokeSchema, z.array(InvokeSchema)]).optional(),
    states: z.record(z.string(), StateNodeSchema).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
);

/**
 * Guard Definition Schema
 * Guards now use Condition objects from @ouni/conditions instead of strings
 */
export const GuardDefinitionSchema = z.object({
  condition: ConditionSchema,
});

export type GuardDefinition = z.infer<typeof GuardDefinitionSchema>;

/**
 * Machine Schema - the complete state machine definition
 *
 * Data is managed via a Store - a collection of named Slices.
 * Each Slice has its own context, queries, and mutations.
 */
export const MachineSchema = z.object({
  id: z.string(),
  initial: z.string(),
  /** Store with named slices (each slice has context, queries, mutations) */
  store: StoreDefinitionSchema.optional(),
  states: z.record(z.string(), StateNodeSchema),
  on: z.record(z.string(), TransitionsSchema).optional(),
  guards: z.record(z.string(), GuardDefinitionSchema).optional(),
  actions: z.record(z.string(), z.union([ActionSchema, z.array(ActionSchema)])).optional(),
});

export type Machine = z.infer<typeof MachineSchema>;

/**
 * Mini-App Definition Schema - includes machine and named definitions
 */
export const MiniAppSchema = z.object({
  machine: MachineSchema,
  guards: z.record(z.string(), GuardDefinitionSchema).optional(),
  actions: z.record(z.string(), z.union([ActionSchema, z.array(ActionSchema)])).optional(),
});

export type MiniApp = z.infer<typeof MiniAppSchema>;
