import {
  evaluate as evaluateCondition,
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

function evaluateConditionObject(
  condition: Condition,
  ctx: GuardContext,
  _compiled?: CompiledCache
): boolean {
  // Conditions are now JSON objects, evaluated directly
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
    return evaluateConditionObject(namedGuard.condition, ctx, compiled);
  }

  const guardObj = guard as Record<string, unknown>;

  if ("condition" in guardObj) {
    // Condition is now a Condition object, not a string
    return evaluateConditionObject(guardObj.condition as Condition, ctx, compiled);
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
