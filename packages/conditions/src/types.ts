/**
 * Condition types for the JSON API
 */

// Comparison operators
export type CompareOp = "===" | "!==" | ">" | ">=" | "<" | "<=" | "==" | "!=";

// Value types used in comparisons
export interface RefValue {
  type: "ref";
  path: string;
  optional?: boolean;
}

export interface LiteralValue {
  type: "literal";
  value: string | number | boolean | null;
}

export interface FunctionValue {
  type: "fn";
  name: string;
  args: Value[];
}

export type Value = RefValue | LiteralValue | FunctionValue | string | number | boolean | null;

// Condition types
export interface TruthyCondition {
  type: "truthy";
  path: string;
  optional?: boolean;
}

export interface LiteralCondition {
  type: "literal";
  value: string | number | boolean | null;
}

export interface CompareCondition {
  type: "compare";
  op: CompareOp;
  left: Value;
  right: Value;
}

export interface AndCondition {
  type: "and";
  conditions: Condition[];
}

export interface OrCondition {
  type: "or";
  conditions: Condition[];
}

export interface NotCondition {
  type: "not";
  condition: Condition;
}

export interface IsDefinedCondition {
  type: "isDefined";
  path: string;
}

export interface IsNullCondition {
  type: "isNull";
  path: string;
}

export interface IsEmptyCondition {
  type: "isEmpty";
  path: string;
}

export interface IsNotEmptyCondition {
  type: "isNotEmpty";
  path: string;
}

export interface MatchCondition {
  type: "match";
  value: string | RefValue;
  cases: Record<string, Condition | boolean>;
  default?: Condition | boolean;
}

export interface StateCondition {
  type: "state";
  matches?: string;
  hasTag?: string;
}

export interface NamedCondition {
  type: "named";
  name: string;
}

// Union of all condition types
export type Condition =
  | string // Shorthand for truthy check
  | boolean // Literal boolean
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
  | FunctionValue // Functions can be used as conditions (truthy check)
  | MatchCondition
  | StateCondition
  | NamedCondition;

// StateValue type for hierarchical states
export type StateValue = string | { [key: string]: StateValue };

// Scope for evaluation
export interface Scope {
  context?: Record<string, unknown>;
  params?: Record<string, unknown>;
  loaderData?: Record<string, unknown>;
  event?: Record<string, unknown>;
  item?: unknown;
  index?: number;
  state?: {
    value: StateValue;
    tags?: string[];
    matches?: (pattern: string) => boolean;
  };
}

// Options for the evaluator
export interface EvaluatorOptions {
  namedConditions?: Record<string, Condition>;
  functions?: Record<string, (...args: unknown[]) => boolean>;
}
