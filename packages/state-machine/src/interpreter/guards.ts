import { parseExpression, evaluate as evaluateCondition } from "@ouni/conditions";
import type { GuardDefinition, Transition } from "../schema/types.ts";
import type { State, Event } from "./state.ts";

/**
 * Guard context passed to condition evaluation
 */
export interface GuardContext {
  context: Record<string, unknown>;
  event: Event;
  state: {
    value: string | Record<string, unknown>;
    matches: (pattern: string) => boolean;
  };
}

/**
 * Evaluate a string expression condition using the conditions package
 */
function evaluateStringCondition(expr: string, ctx: GuardContext): boolean {
  const condition = parseExpression(expr);
  return evaluateCondition(condition, ctx);
}

/**
 * Resolve a guard and evaluate it
 */
export function evaluateGuard(
  guard: unknown,
  ctx: GuardContext,
  namedGuards: Record<string, GuardDefinition>
): boolean {
  if (!guard) return true;

  // String reference to named guard
  if (typeof guard === "string") {
    const namedGuard = namedGuards[guard];
    if (!namedGuard) {
      console.warn(`Guard "${guard}" not found`);
      return false;
    }
    return evaluateStringCondition(namedGuard.condition, ctx);
  }

  const guardObj = guard as Record<string, unknown>;

  // Inline condition
  if ("condition" in guardObj && typeof guardObj.condition === "string") {
    return evaluateStringCondition(guardObj.condition, ctx);
  }

  // AND guard
  if ("and" in guardObj && Array.isArray(guardObj.and)) {
    return guardObj.and.every((g) => evaluateGuard(g, ctx, namedGuards));
  }

  // OR guard
  if ("or" in guardObj && Array.isArray(guardObj.or)) {
    return guardObj.or.some((g) => evaluateGuard(g, ctx, namedGuards));
  }

  // NOT guard
  if ("not" in guardObj) {
    return !evaluateGuard(guardObj.not, ctx, namedGuards);
  }

  return true;
}

/**
 * Find the first matching transition for an event
 */
export function findMatchingTransition(
  transitions: unknown,
  ctx: GuardContext,
  namedGuards: Record<string, GuardDefinition>
): Transition | undefined {
  if (!transitions) return undefined;

  // Simple string target
  if (typeof transitions === "string") {
    return transitions;
  }

  // Single transition object
  if (!Array.isArray(transitions)) {
    const transitionObj = transitions as Record<string, unknown>;
    const guard = transitionObj.guard;
    if (evaluateGuard(guard, ctx, namedGuards)) {
      return transitions as Transition;
    }
    return undefined;
  }

  // Array of transitions - find first match
  for (const transition of transitions) {
    if (typeof transition === "string") {
      return transition;
    }
    const transitionObj = transition as Record<string, unknown>;
    const guard = transitionObj.guard;
    if (evaluateGuard(guard, ctx, namedGuards)) {
      return transition as Transition;
    }
  }

  return undefined;
}

/**
 * Create a guard context from machine state
 */
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
