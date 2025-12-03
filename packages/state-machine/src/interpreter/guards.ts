import {
  evaluate as evaluateCondition,
  parseExpression,
  type Condition,
  type Scope,
  type StateValue,
} from "@ouni/conditions";
import type { CompiledCache } from "../compiler/types";
import type { GuardDefinition, Transition } from "../schema/types";
import type { Event, State } from "./state";

export interface GuardContext {
  context: Record<string, unknown>;
  event: Event;
  state: {
    value: StateValue;
    matches: (pattern: string) => boolean;
  };
}

function evaluateStringCondition(
  expr: string,
  ctx: GuardContext,
  compiled?: CompiledCache
): boolean {
  // Check compiled cache first
  const cached = compiled?.guards.get(expr);
  if (cached) {
    return evaluateCondition(cached.ast, ctx as Scope);
  }

  // Fallback to runtime parse (backward compatible)
  const condition = parseExpression(expr);
  return evaluateCondition(condition, ctx as Scope);
}

export function evaluateGuard(
  guard: unknown,
  ctx: GuardContext,
  namedGuards: Record<string, GuardDefinition>,
  compiled?: CompiledCache
): boolean {
  if (!guard) return true;

  if (typeof guard === "string") {
    const namedGuard = namedGuards[guard];
    if (!namedGuard) {
      console.warn(`Guard "${guard}" not found`);
      return false;
    }
    return evaluateStringCondition(namedGuard.condition, ctx, compiled);
  }

  const guardObj = guard as Record<string, unknown>;

  if ("condition" in guardObj && typeof guardObj.condition === "string") {
    return evaluateStringCondition(guardObj.condition, ctx, compiled);
  }

  if ("and" in guardObj && Array.isArray(guardObj.and)) {
    return guardObj.and.every((g) => evaluateGuard(g, ctx, namedGuards, compiled));
  }

  if ("or" in guardObj && Array.isArray(guardObj.or)) {
    return guardObj.or.some((g) => evaluateGuard(g, ctx, namedGuards, compiled));
  }

  if ("not" in guardObj) {
    return !evaluateGuard(guardObj.not, ctx, namedGuards, compiled);
  }

  return true;
}

export function findMatchingTransition(
  transitions: unknown,
  ctx: GuardContext,
  namedGuards: Record<string, GuardDefinition>,
  compiled?: CompiledCache
): Transition | undefined {
  if (!transitions) return undefined;

  if (typeof transitions === "string") {
    return transitions;
  }

  if (!Array.isArray(transitions)) {
    const transitionObj = transitions as Record<string, unknown>;
    const guard = transitionObj.guard;
    if (evaluateGuard(guard, ctx, namedGuards, compiled)) {
      return transitions as Transition;
    }
    return undefined;
  }

  for (const transition of transitions) {
    if (typeof transition === "string") {
      return transition;
    }
    const transitionObj = transition as Record<string, unknown>;
    const guard = transitionObj.guard;
    if (evaluateGuard(guard, ctx, namedGuards, compiled)) {
      return transition as Transition;
    }
  }

  return undefined;
}

export function createGuardContext<TContext extends Record<string, unknown>>(
  state: State<TContext>,
  event: Event,
  matchFn: (pattern: string) => boolean
): GuardContext {
  return {
    context: state.context,
    event,
    state: {
      value: state.value,
      matches: matchFn,
    },
  };
}
