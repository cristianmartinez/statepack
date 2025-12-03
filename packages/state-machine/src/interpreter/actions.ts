import { evaluate as evalCondition, parseExpression } from "@ouni/conditions";
import { evaluate as evaluateExpression, evaluateCompiledTemplate } from "@ouni/expressions";
import type { CompiledCache } from "../compiler/types";
import type { Action, Actions } from "../schema/types";
import type { Event } from "./state";

/**
 * Evaluate a string condition expression using the conditions package
 */
function evaluateCondition(
  expr: string,
  ctx: { context: Record<string, unknown>; event: Event },
  compiled?: CompiledCache
): boolean {
  // Check compiled cache first
  const cached = compiled?.guards.get(expr);
  if (cached) {
    return evalCondition(cached.ast, ctx);
  }

  // Fallback to runtime parse (backward compatible)
  const condition = parseExpression(expr);
  return evalCondition(condition, ctx);
}

/**
 * Context for action execution
 */
export interface ActionContext {
  context: Record<string, unknown>;
  event: Event;
  state: {
    value: string | Record<string, unknown>;
  };
}

/**
 * Result of executing actions
 */
export interface ActionResult {
  /** Updated context after assign actions */
  context: Record<string, unknown>;
  /** Events to raise immediately */
  raisedEvents: Event[];
  /** Events to send (possibly with delay) */
  sentEvents: Array<{ event: Event; delay?: number }>;
  /** Side effects to execute */
  effects: ActionEffect[];
}

/**
 * A side effect to execute
 */
export interface ActionEffect {
  type: string;
  params: Record<string, unknown>;
}

/**
 * Action executor interface for implementing custom actions
 */
export interface ActionExecutor {
  execute(effect: ActionEffect): Promise<void>;
}

/**
 * Resolve and execute actions
 */
export function executeActions(
  actions: Actions | undefined,
  ctx: ActionContext,
  namedActions: Record<string, Action | Action[]>,
  compiled?: CompiledCache
): ActionResult {
  const result: ActionResult = {
    context: { ...ctx.context },
    raisedEvents: [],
    sentEvents: [],
    effects: [],
  };

  if (!actions) return result;

  const actionList = Array.isArray(actions) ? actions : [actions];

  for (const action of actionList) {
    executeAction(action, ctx, namedActions, result, compiled);
  }

  return result;
}

function executeAction(
  action: Action,
  ctx: ActionContext,
  namedActions: Record<string, Action | Action[]>,
  result: ActionResult,
  compiled?: CompiledCache
): void {
  // String reference to named action
  if (typeof action === "string") {
    const namedAction = namedActions[action];
    if (!namedAction) {
      console.warn(`Action "${action}" not found`);
      return;
    }
    const actionList = Array.isArray(namedAction) ? namedAction : [namedAction];
    for (const a of actionList) {
      executeAction(a, ctx, namedActions, result, compiled);
    }
    return;
  }

  const actionObj = action as Record<string, unknown>;

  // Check condition
  if (actionObj.condition && typeof actionObj.condition === "string") {
    const conditionCtx = {
      context: result.context,
      event: ctx.event,
    };
    if (!evaluateCondition(actionObj.condition, conditionCtx, compiled)) {
      return;
    }
  }

  const actionType = actionObj.type as string;

  switch (actionType) {
    case "assign":
      handleAssign(actionObj, ctx, result, compiled);
      break;

    case "raise":
      handleRaise(actionObj, ctx, result, compiled);
      break;

    case "send":
      handleSend(actionObj, ctx, result, compiled);
      break;

    case "conditional":
      handleConditional(actionObj, ctx, namedActions, result, compiled);
      break;

    case "log":
    case "navigate":
    case "back":
    case "fetch":
    case "storage.get":
    case "storage.set":
    case "storage.remove":
    case "toast":
    case "haptic":
    case "clipboard":
    case "focus":
    case "host.event":
    case "host.close":
    case "host.analytics":
    case "transform":
    case "spawn":
    case "sendTo":
    case "stop":
      handleEffect(actionObj, ctx, result, compiled);
      break;

    default:
      console.warn(`Unknown action type: ${actionType}`);
  }
}

function handleAssign(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): void {
  const values = action.values as Record<string, unknown>;
  if (!values) return;

  for (const [key, value] of Object.entries(values)) {
    result.context[key] = resolveValue(
      value,
      {
        context: result.context,
        event: ctx.event,
      },
      compiled
    );
  }
}

function handleRaise(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): void {
  const eventType = resolveValue(
    action.event,
    {
      context: result.context,
      event: ctx.event,
    },
    compiled
  ) as string;

  const payload = action.payload
    ? resolveValues(
        action.payload as Record<string, unknown>,
        {
          context: result.context,
          event: ctx.event,
        },
        compiled
      )
    : {};

  result.raisedEvents.push({ type: eventType, ...payload });
}

function handleSend(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): void {
  const eventType = resolveValue(
    action.event,
    {
      context: result.context,
      event: ctx.event,
    },
    compiled
  ) as string;

  const payload = action.payload
    ? resolveValues(
        action.payload as Record<string, unknown>,
        {
          context: result.context,
          event: ctx.event,
        },
        compiled
      )
    : {};

  const delay = action.delay as number | undefined;

  result.sentEvents.push({
    event: { type: eventType, ...payload },
    delay,
  });
}

function handleConditional(
  action: Record<string, unknown>,
  ctx: ActionContext,
  namedActions: Record<string, Action | Action[]>,
  result: ActionResult,
  compiled?: CompiledCache
): void {
  const condition = action.condition as string;
  const conditionCtx = {
    context: result.context,
    event: ctx.event,
  };

  const conditionMet = evaluateCondition(condition, conditionCtx, compiled);

  const actions = conditionMet ? (action.then as Action[]) : (action.else as Action[] | undefined);

  if (actions) {
    for (const a of actions) {
      executeAction(a, { ...ctx, context: result.context }, namedActions, result, compiled);
    }
  }
}

function handleEffect(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): void {
  // Resolve all template values in the action params
  const resolvedParams = resolveValues(
    action,
    {
      context: result.context,
      event: ctx.event,
    },
    compiled
  );

  result.effects.push({
    type: action.type as string,
    params: resolvedParams,
  });
}

/**
 * Resolve a single value (handles template expressions)
 */
function resolveValue(
  value: unknown,
  scope: { context: Record<string, unknown>; event: Event },
  compiled?: CompiledCache
): unknown {
  if (typeof value === "string") {
    // Check for full template expression "{{ ... }}"
    if (value.startsWith("{{") && value.endsWith("}}")) {
      // Check compiled template cache first (it has the whole string as key)
      const cachedTemplate = compiled?.templates.get(value);
      if (cachedTemplate) {
        return evaluateCompiledTemplate(cachedTemplate.compilation, scope);
      }

      // Try expression cache with trimmed expression
      const expr = value.slice(2, -2).trim();
      const cachedExpr = compiled?.expressions.get(expr);
      if (cachedExpr) {
        // For now, use the string-based evaluator as fallback
        // TODO: Add AST-only evaluation support to expressions package
        return evaluateExpression(expr, scope);
      }

      // Fallback to runtime parse
      return evaluateExpression(expr, scope);
    }

    // Check for inline template parts "Hello {{ name }}"
    if (value.includes("{{")) {
      // Check compiled template cache
      const cachedTemplate = compiled?.templates.get(value);
      if (cachedTemplate) {
        return evaluateCompiledTemplate(cachedTemplate.compilation, scope);
      }

      // Fallback to runtime template evaluation
      return value.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
        const result = evaluateExpression(expr.trim(), scope);
        return String(result ?? "");
      });
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, scope, compiled));
  }

  if (value !== null && typeof value === "object") {
    return resolveValues(value as Record<string, unknown>, scope, compiled);
  }

  return value;
}

/**
 * Resolve all values in an object
 */
function resolveValues(
  obj: Record<string, unknown>,
  scope: { context: Record<string, unknown>; event: Event },
  compiled?: CompiledCache
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "type" || key === "condition") {
      result[key] = value; // Don't resolve these
    } else {
      result[key] = resolveValue(value, scope, compiled);
    }
  }
  return result;
}

/**
 * Normalize actions to array
 */
export function normalizeActions(actions: Actions | undefined): Action[] {
  if (!actions) return [];
  return Array.isArray(actions) ? actions : [actions];
}
