import { compileData } from "@ouni/data";
import { compileExpression as compileJSONataExpression } from "@ouni/expressions";
import type { Action, Actions, Machine, StateNode, Transition, Transitions } from "../schema/types";
import type { CompiledMachine } from "./types";

export type { CompiledCache, CompiledMachine } from "./types";
export { isCompiledMachine } from "./types";

/**
 * Compile a state machine by pre-compiling all JSONata expressions
 *
 * This walks the entire machine tree and compiles:
 * - Guard conditions in transitions (JSON objects, no compilation needed)
 * - Condition strings in actions (JSON objects, no compilation needed)
 * - Expression strings in assign actions → JSONata
 * - Template strings in action parameters → JSONata parts
 * - Query expressions (derived state from context) via @ouni/data
 * - Mutation expressions (context modifications) via @ouni/data
 */
export function compileMachine(machine: Machine): CompiledMachine {
  const compiled: CompiledMachine["compiled"] = {
    guards: new Map(),
    expressions: new Map(),
  };

  // Note: Guards (conditions) are no longer compiled.
  // The @ouni/conditions package uses JSON condition objects directly.
  // Guards will be evaluated at runtime using the condition objects.

  // Compile queries and mutations using the data package compiler
  let data: ReturnType<typeof compileData> | undefined;
  if (machine.queries || machine.mutations) {
    data = compileData({
      queries: machine.queries,
      mutations: machine.mutations,
    });
  }

  // Compile named actions
  if (machine.actions) {
    for (const action of Object.values(machine.actions)) {
      compileActions(action, compiled);
    }
  }

  // Compile global transitions
  if (machine.on) {
    for (const transitions of Object.values(machine.on)) {
      compileTransitions(transitions, compiled);
    }
  }

  // Compile all states recursively
  for (const state of Object.values(machine.states)) {
    compileStateNode(state, compiled);
  }

  return {
    source: machine,
    compiled,
    data,
    version: "1.0.0",
    compiledAt: Date.now(),
  };
}

/**
 * Compile a state node and all its nested states
 */
function compileStateNode(state: StateNode, compiled: CompiledMachine["compiled"]): void {
  // Compile entry/exit actions
  if (state.entry) {
    compileActions(state.entry, compiled);
  }
  if (state.exit) {
    compileActions(state.exit, compiled);
  }

  // Compile transition guards and actions
  if (state.on) {
    for (const transitions of Object.values(state.on)) {
      compileTransitions(transitions, compiled);
    }
  }

  if (state.after) {
    for (const transitions of Object.values(state.after)) {
      compileTransitions(transitions, compiled);
    }
  }

  if (state.always) {
    for (const transition of state.always) {
      compileTransition(transition, compiled);
    }
  }

  // Recursively compile nested states
  if (state.states) {
    for (const childState of Object.values(state.states)) {
      compileStateNode(childState, compiled);
    }
  }
}

/**
 * Compile transitions (can be single or array)
 */
function compileTransitions(transitions: Transitions, compiled: CompiledMachine["compiled"]): void {
  if (Array.isArray(transitions)) {
    for (const transition of transitions) {
      compileTransition(transition, compiled);
    }
  } else {
    compileTransition(transitions, compiled);
  }
}

/**
 * Compile a single transition
 */
function compileTransition(transition: Transition, compiled: CompiledMachine["compiled"]): void {
  if (typeof transition === "string") {
    return; // Simple target state, nothing to compile
  }

  // Guard compilation not needed - conditions are JSON objects

  // Compile actions
  if (transition.actions) {
    compileActions(transition.actions, compiled);
  }
}

/**
 * Compile actions (can be single action or array)
 */
function compileActions(actions: Actions, compiled: CompiledMachine["compiled"]): void {
  const actionList = Array.isArray(actions) ? actions : [actions];

  for (const action of actionList) {
    compileAction(action, compiled);
  }
}

/**
 * Compile a single action
 */
function compileAction(action: Action, compiled: CompiledMachine["compiled"]): void {
  if (typeof action === "string") {
    return; // Named action reference
  }

  const actionObj = action as Record<string, unknown>;
  const actionType = actionObj.type as string;

  switch (actionType) {
    case "assign":
      // Compile assign values (expressions)
      if (actionObj.values && typeof actionObj.values === "object") {
        for (const value of Object.values(actionObj.values as Record<string, unknown>)) {
          compileValue(value, compiled);
        }
      }
      break;

    case "conditional":
      // Note: Conditions are no longer compiled (they are JSON objects)
      // Compile nested actions only
      if (actionObj.then) {
        compileActions(actionObj.then as Actions, compiled);
      }
      if (actionObj.else) {
        compileActions(actionObj.else as Actions, compiled);
      }
      break;

    default:
      // Compile all string values in action params (templates/expressions)
      compileActionParams(actionObj, compiled);
      break;
  }
}

/**
 * Compile all string parameters in an action
 */
function compileActionParams(
  actionObj: Record<string, unknown>,
  compiled: CompiledMachine["compiled"]
): void {
  for (const [key, value] of Object.entries(actionObj)) {
    if (key === "type" || key === "condition") {
      continue; // Skip these
    }
    compileValue(value, compiled);
  }
}

/**
 * Compile a value (can be string expression, array, or object)
 * All strings are treated as JSONata expressions
 */
function compileValue(value: unknown, compiled: CompiledMachine["compiled"]): void {
  if (typeof value === "string") {
    // All strings are JSONata expressions
    if (!compiled.expressions.has(value)) {
      try {
        const compiledExpr = compileJSONataExpression(value);
        compiled.expressions.set(value, { source: value, compiled: compiledExpr });
      } catch {
        // Not a valid expression, skip compilation
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      compileValue(item, compiled);
    }
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      compileValue(v, compiled);
    }
  }
}
