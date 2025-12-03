import type {
  Condition,
  Scope,
  EvaluatorOptions,
  CompareCondition,
  FunctionCondition,
  MatchCondition,
  StateCondition,
} from "./types";
import { getPath, resolveValue, isEmpty } from "./utils";
import { builtinFunctions, resolveFunctionArgs } from "./functions";

/**
 * Evaluate a condition against a scope
 */
export function evaluate(
  condition: Condition,
  scope: Scope,
  options: EvaluatorOptions = {}
): boolean {
  // Shorthand: string becomes truthy check
  if (typeof condition === "string") {
    return !!getPath(scope, condition);
  }

  // Shorthand: boolean literal
  if (typeof condition === "boolean") {
    return condition;
  }

  // Handle object conditions
  switch (condition.type) {
    case "truthy":
      return !!getPath(scope, condition.path, condition.optional);

    case "literal":
      return !!condition.value;

    case "compare":
      return evaluateCompare(condition, scope);

    case "and":
      return condition.conditions.every((c) => evaluate(c, scope, options));

    case "or":
      return condition.conditions.some((c) => evaluate(c, scope, options));

    case "not":
      return !evaluate(condition.condition, scope, options);

    case "isDefined": {
      const val = getPath(scope, condition.path);
      return val !== null && val !== undefined;
    }

    case "isNull":
      return getPath(scope, condition.path) === null;

    case "isEmpty":
      return isEmpty(getPath(scope, condition.path));

    case "isNotEmpty":
      return !isEmpty(getPath(scope, condition.path));

    case "fn":
      return evaluateFunction(condition, scope, options);

    case "match":
      return evaluateMatch(condition, scope, options);

    case "state":
      return evaluateState(condition, scope);

    case "named": {
      const namedCondition = options.namedConditions?.[condition.name];
      if (!namedCondition) {
        throw new Error(`Unknown named condition: ${condition.name}`);
      }
      return evaluate(namedCondition, scope, options);
    }

    default:
      throw new Error(
        `Unknown condition type: ${(condition as { type: string }).type}`
      );
  }
}

/**
 * Evaluate a comparison condition
 */
function evaluateCompare(condition: CompareCondition, scope: Scope): boolean {
  const left = resolveValue(condition.left, scope);
  const right = resolveValue(condition.right, scope);

  switch (condition.op) {
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case ">":
      return (left as number) > (right as number);
    case ">=":
      return (left as number) >= (right as number);
    case "<":
      return (left as number) < (right as number);
    case "<=":
      return (left as number) <= (right as number);
    case "==":
      return left == right;
    case "!=":
      return left != right;
    default:
      throw new Error(`Unknown comparison operator: ${condition.op}`);
  }
}

/**
 * Evaluate a function condition
 */
function evaluateFunction(
  condition: FunctionCondition,
  scope: Scope,
  options: EvaluatorOptions
): boolean {
  // Check for custom function first
  const customFn = options.functions?.[condition.name];
  if (customFn) {
    const args = resolveFunctionArgs(condition.args, scope);
    return customFn(...args);
  }

  // Use built-in function
  const builtinFn = builtinFunctions[condition.name];
  if (!builtinFn) {
    throw new Error(`Unknown function: ${condition.name}`);
  }

  const args = resolveFunctionArgs(condition.args, scope);
  const result = builtinFn(args, scope);
  return typeof result === "boolean" ? result : result > 0;
}

/**
 * Evaluate a match condition
 */
function evaluateMatch(
  condition: MatchCondition,
  scope: Scope,
  options: EvaluatorOptions
): boolean {
  const value = resolveValue(condition.value, scope);
  const stringValue = String(value);

  // Check if there's a matching case
  if (stringValue in condition.cases) {
    const caseResult = condition.cases[stringValue];
    if (typeof caseResult === "boolean") {
      return caseResult;
    }
    return evaluate(caseResult!, scope, options);
  }

  // Use default if no match
  if (condition.default !== undefined) {
    if (typeof condition.default === "boolean") {
      return condition.default;
    }
    return evaluate(condition.default, scope, options);
  }

  return false;
}

/**
 * Evaluate a state condition
 */
function evaluateState(condition: StateCondition, scope: Scope): boolean {
  const state = scope.state;
  if (!state) return false;

  if (condition.matches !== undefined) {
    // Use matches function if available (for hierarchical states)
    if (state.matches) {
      return state.matches(condition.matches);
    }
    // Fallback for simple string states
    const currentState = state.value;
    if (typeof currentState === "string") {
      if (condition.matches === currentState) return true;
      if (currentState.startsWith(condition.matches + ".")) return true;
    }
    return false;
  }

  if (condition.hasTag !== undefined) {
    return state.tags?.includes(condition.hasTag) ?? false;
  }

  return false;
}

/**
 * Create an evaluator with preset options
 */
export function createEvaluator(options: EvaluatorOptions = {}) {
  return (condition: Condition, scope: Scope): boolean => {
    return evaluate(condition, scope, options);
  };
}
