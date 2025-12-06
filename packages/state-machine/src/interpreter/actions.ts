import { evaluate as evalCondition, type Condition } from "@ouni/conditions";
import type { CompiledData } from "@ouni/data";
import { evaluateCompiled } from "@ouni/expressions";
import type { CompiledCache } from "../compiler/types";
import type { Action, Actions } from "../schema/types";
import type { Event } from "./state";

/**
 * Evaluate a condition object using the conditions package
 */
function evaluateCondition(
  condition: Condition,
  ctx: { context: Record<string, unknown>; event: Event },
  _compiled?: CompiledCache
): boolean {
  // Conditions are now JSON objects, evaluated directly
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
 * Options for executing actions
 */
export interface ExecuteActionsOptions {
  namedActions: Record<string, Action | Action[]>;
  data?: CompiledData;
  compiled?: CompiledCache;
}

/**
 * Resolve and execute actions (async)
 */
export async function executeActions(
  actions: Actions | undefined,
  ctx: ActionContext,
  options: ExecuteActionsOptions
): Promise<ActionResult> {
  const result: ActionResult = {
    context: { ...ctx.context },
    raisedEvents: [],
    sentEvents: [],
    effects: [],
  };

  if (!actions) return result;

  const actionList = Array.isArray(actions) ? actions : [actions];

  for (const action of actionList) {
    await executeAction(action, ctx, options, result);
  }

  return result;
}

async function executeAction(
  action: Action,
  ctx: ActionContext,
  options: ExecuteActionsOptions,
  result: ActionResult
): Promise<void> {
  const { namedActions, data, compiled } = options;

  // String reference to named action
  if (typeof action === "string") {
    const namedAction = namedActions[action];
    if (!namedAction) {
      console.warn(`Action "${action}" not found`);
      return;
    }
    const actionList = Array.isArray(namedAction) ? namedAction : [namedAction];
    for (const a of actionList) {
      await executeAction(a, ctx, options, result);
    }
    return;
  }

  const actionObj = action as Record<string, unknown>;
  const actionType = actionObj.type as string;

  // Check condition guard (but not for conditional actions which use condition for branching)
  if (
    actionType !== "conditional" &&
    actionObj.condition &&
    typeof actionObj.condition === "string"
  ) {
    const conditionCtx = {
      context: result.context,
      event: ctx.event,
    };
    if (!evaluateCondition(actionObj.condition, conditionCtx, compiled)) {
      return;
    }
  }

  switch (actionType) {
    case "assign":
      await handleAssign(actionObj, ctx, result, compiled);
      break;

    case "raise":
      await handleRaise(actionObj, ctx, result, compiled);
      break;

    case "send":
      await handleSend(actionObj, ctx, result, compiled);
      break;

    case "conditional":
      await handleConditional(actionObj, ctx, options, result);
      break;

    case "mutation":
      await handleMutation(actionObj, ctx, result, data);
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
      await handleEffect(actionObj, ctx, result, compiled);
      break;

    default:
      console.warn(`Unknown action type: ${actionType}`);
  }
}

async function handleAssign(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): Promise<void> {
  const values = action.values as Record<string, unknown>;
  if (!values) return;

  for (const [key, value] of Object.entries(values)) {
    result.context[key] = await resolveValue(
      value,
      {
        context: result.context,
        event: ctx.event,
      },
      compiled
    );
  }
}

async function handleRaise(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): Promise<void> {
  const eventType = (await resolveValue(
    action.event,
    {
      context: result.context,
      event: ctx.event,
    },
    compiled
  )) as string;

  const payload = action.payload
    ? await resolveValues(
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

async function handleSend(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): Promise<void> {
  const eventType = (await resolveValue(
    action.event,
    {
      context: result.context,
      event: ctx.event,
    },
    compiled
  )) as string;

  const payload = action.payload
    ? await resolveValues(
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

async function handleConditional(
  action: Record<string, unknown>,
  ctx: ActionContext,
  options: ExecuteActionsOptions,
  result: ActionResult
): Promise<void> {
  const condition = action.condition as Condition;
  const conditionCtx = {
    context: result.context,
    event: ctx.event,
  };

  const conditionMet = evaluateCondition(condition, conditionCtx, options.compiled);

  const actions = conditionMet ? (action.then as Action[]) : (action.else as Action[] | undefined);

  if (actions) {
    for (const a of actions) {
      await executeAction(a, { ...ctx, context: result.context }, options, result);
    }
  }
}

async function handleMutation(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  data?: CompiledData
): Promise<void> {
  const mutationName = action.name as string;
  if (!mutationName) {
    console.warn("Mutation action missing 'name' field");
    return;
  }

  const mutation = data?.source.mutations?.[mutationName];
  if (!mutation) {
    console.warn(`Mutation "${mutationName}" not found`);
    return;
  }

  // Merge action payload with event
  const eventWithPayload = action.payload
    ? { ...ctx.event, ...(action.payload as Record<string, unknown>) }
    : ctx.event;

  const scope = {
    context: result.context,
    event: eventWithPayload,
  };

  // Execute each mutation assignment using compiled expressions from data package
  for (const [contextKey, exprString] of Object.entries(mutation)) {
    const expr = data.compiled.expressions.get(exprString);
    if (expr) {
      result.context[contextKey] = await evaluateCompiled(expr.compiled, scope);
    } else {
      console.warn(`Compiled expression not found for mutation ${mutationName}.${contextKey}`);
    }
  }
}

async function handleEffect(
  action: Record<string, unknown>,
  ctx: ActionContext,
  result: ActionResult,
  compiled?: CompiledCache
): Promise<void> {
  // Resolve all template values in the action params
  const resolvedParams = await resolveValues(
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
 * Resolve a single value (evaluates JSONata expressions) - async
 */
async function resolveValue(
  value: unknown,
  scope: { context: Record<string, unknown>; event: Event },
  compiled?: CompiledCache
): Promise<unknown> {
  if (typeof value === "string") {
    // All strings are JSONata expressions - look up in compiled cache
    const cached = compiled?.expressions.get(value);
    if (cached) {
      return await evaluateCompiled(cached.compiled, scope);
    }
    // Not in cache (not a valid expression) - return as-is
    return value;
  }

  if (Array.isArray(value)) {
    return await Promise.all(value.map((v) => resolveValue(v, scope, compiled)));
  }

  if (value !== null && typeof value === "object") {
    return await resolveValues(value as Record<string, unknown>, scope, compiled);
  }

  return value;
}

/**
 * Resolve all values in an object - async
 */
async function resolveValues(
  obj: Record<string, unknown>,
  scope: { context: Record<string, unknown>; event: Event },
  compiled?: CompiledCache
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "type" || key === "condition") {
      result[key] = value; // Don't resolve these
    } else {
      result[key] = await resolveValue(value, scope, compiled);
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
