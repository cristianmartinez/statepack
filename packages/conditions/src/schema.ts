/**
 * Zod schemas for condition types with runtime validation
 */

import { z } from "zod";

// Comparison operators
export const CompareOpSchema = z.enum(["===", "!==", ">", ">=", "<", "<=", "==", "!="]);

// Value types used in comparisons
export const RefValueSchema = z.object({
  type: z.literal("ref"),
  path: z.string(),
  optional: z.boolean().optional(),
});

export const LiteralValueSchema = z.object({
  type: z.literal("literal"),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const FunctionValueSchema: z.ZodSchema = z.lazy(() =>
  z.object({
    type: z.literal("fn"),
    name: z.string(),
    args: z.array(ValueSchema),
  })
);

export const ValueSchema: z.ZodSchema = z.lazy(() =>
  z.union([
    RefValueSchema,
    LiteralValueSchema,
    FunctionValueSchema,
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ])
);

// Condition types
export const TruthyConditionSchema = z.object({
  type: z.literal("truthy"),
  path: z.string(),
  optional: z.boolean().optional(),
});

export const LiteralConditionSchema = z.object({
  type: z.literal("literal"),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const CompareConditionSchema = z.object({
  type: z.literal("compare"),
  op: CompareOpSchema,
  left: ValueSchema,
  right: ValueSchema,
});

export const AndConditionSchema: z.ZodSchema = z.lazy(() =>
  z.object({
    type: z.literal("and"),
    conditions: z.array(ConditionSchema),
  })
);

export const OrConditionSchema: z.ZodSchema = z.lazy(() =>
  z.object({
    type: z.literal("or"),
    conditions: z.array(ConditionSchema),
  })
);

export const NotConditionSchema: z.ZodSchema = z.lazy(() =>
  z.object({
    type: z.literal("not"),
    condition: ConditionSchema,
  })
);

export const IsDefinedConditionSchema = z.object({
  type: z.literal("isDefined"),
  path: z.string(),
});

export const IsNullConditionSchema = z.object({
  type: z.literal("isNull"),
  path: z.string(),
});

export const IsEmptyConditionSchema = z.object({
  type: z.literal("isEmpty"),
  path: z.string(),
});

export const IsNotEmptyConditionSchema = z.object({
  type: z.literal("isNotEmpty"),
  path: z.string(),
});

export const MatchConditionSchema: z.ZodSchema = z.lazy(() =>
  z.object({
    type: z.literal("match"),
    value: z.union([z.string(), RefValueSchema]),
    cases: z.record(z.union([ConditionSchema, z.boolean()])),
    default: z.union([ConditionSchema, z.boolean()]).optional(),
  })
);

export const StateConditionSchema = z.object({
  type: z.literal("state"),
  matches: z.string().optional(),
  hasTag: z.string().optional(),
});

export const NamedConditionSchema = z.object({
  type: z.literal("named"),
  name: z.string(),
});

// Union of all condition types
export const ConditionSchema: z.ZodSchema = z.lazy(() =>
  z.union([
    z.string(), // Shorthand for truthy check
    z.boolean(), // Literal boolean
    TruthyConditionSchema,
    LiteralConditionSchema,
    CompareConditionSchema,
    AndConditionSchema,
    OrConditionSchema,
    NotConditionSchema,
    IsDefinedConditionSchema,
    IsNullConditionSchema,
    IsEmptyConditionSchema,
    IsNotEmptyConditionSchema,
    FunctionValueSchema, // Functions can be used as conditions (truthy check)
    MatchConditionSchema,
    StateConditionSchema,
    NamedConditionSchema,
  ])
);

// StateValue type for hierarchical states
export const StateValueSchema: z.ZodSchema = z.lazy(() =>
  z.union([z.string(), z.record(StateValueSchema)])
);

// Scope for evaluation
export const ScopeSchema = z.object({
  context: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
  loaderData: z.record(z.unknown()).optional(),
  event: z.record(z.unknown()).optional(),
  item: z.unknown().optional(),
  index: z.number().optional(),
  state: z
    .object({
      value: StateValueSchema,
      tags: z.array(z.string()).optional(),
      matches: z.function().args(z.string()).returns(z.boolean()).optional(),
    })
    .optional(),
});

// Options for the evaluator
export const EvaluatorOptionsSchema = z.object({
  namedConditions: z.record(ConditionSchema).optional(),
  functions: z.record(z.function().args(z.array(z.unknown())).returns(z.boolean())).optional(),
});

// Inferred types (manually defined to avoid circular reference issues)
export type RefValue = z.infer<typeof RefValueSchema>;
export type LiteralValue = z.infer<typeof LiteralValueSchema>;
export type FunctionValue = {
  type: "fn";
  name: string;
  args: Value[];
};
export type Value = RefValue | LiteralValue | FunctionValue | string | number | boolean | null;

export type CompareOp = z.infer<typeof CompareOpSchema>;
export type TruthyCondition = z.infer<typeof TruthyConditionSchema>;
export type LiteralCondition = z.infer<typeof LiteralConditionSchema>;
export type CompareCondition = {
  type: "compare";
  op: CompareOp;
  left: Value;
  right: Value;
};
export type AndCondition = {
  type: "and";
  conditions: Condition[];
};
export type OrCondition = {
  type: "or";
  conditions: Condition[];
};
export type NotCondition = {
  type: "not";
  condition: Condition;
};
export type IsDefinedCondition = z.infer<typeof IsDefinedConditionSchema>;
export type IsNullCondition = z.infer<typeof IsNullConditionSchema>;
export type IsEmptyCondition = z.infer<typeof IsEmptyConditionSchema>;
export type IsNotEmptyCondition = z.infer<typeof IsNotEmptyConditionSchema>;
export type MatchCondition = {
  type: "match";
  value: string | RefValue;
  cases: Record<string, Condition | boolean>;
  default?: Condition | boolean;
};
export type StateCondition = z.infer<typeof StateConditionSchema>;
export type NamedCondition = z.infer<typeof NamedConditionSchema>;
export type Condition =
  | string
  | boolean
  | TruthyCondition
  | LiteralCondition
  | CompareCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | IsDefinedCondition
  | IsNullCondition
  | IsEmptyCondition
  | IsNotEmptyCondition
  | FunctionValue
  | MatchCondition
  | StateCondition
  | NamedCondition;

export type StateValue = string | { [key: string]: StateValue };
export type Scope = z.infer<typeof ScopeSchema>;
export type EvaluatorOptions = {
  namedConditions?: Record<string, Condition>;
  functions?: Record<string, (...args: unknown[]) => boolean>;
};
