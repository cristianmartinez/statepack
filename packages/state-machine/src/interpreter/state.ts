import type { Machine, StateNode } from "../schema/types";

/**
 * Represents the current state value
 * Can be a simple string or nested object for hierarchical states
 */
export type StateValue = string | { [key: string]: StateValue };

/**
 * The current snapshot of the state machine
 */
export interface State<TContext = Record<string, unknown>> {
  /** Current state value (can be nested for hierarchical states) */
  value: StateValue;
  /** Extended state (context data) */
  context: TContext;
  /** History of state transitions */
  history?: State<TContext>;
  /** Whether machine has reached a final state */
  done: boolean;
  /** Events that triggered this state */
  event?: Event;
  /** Metadata from current state(s) */
  meta: Record<string, unknown>;
  /** Active child machine actors */
  children: Map<string, unknown>;
}

/**
 * An event that can be sent to the machine
 */
export interface Event {
  type: string;
  [key: string]: unknown;
}

/**
 * Create the initial state for a machine
 */
export function createInitialState<TContext extends Record<string, unknown>>(
  machine: Machine
): State<TContext> {
  const initialValue = resolveInitialValue(machine.states, machine.initial);

  return {
    value: initialValue,
    context: (machine.context ?? {}) as TContext,
    done: false,
    meta: collectMeta(machine.states, initialValue),
    children: new Map(),
  };
}

/**
 * Resolve the full initial state value including nested states
 */
function resolveInitialValue(states: Record<string, StateNode>, initial: string): StateValue {
  const state = states[initial];
  if (!state) return initial;

  // If state has nested states, recursively resolve
  if (state.states && state.initial && state.type !== "parallel") {
    return {
      [initial]: resolveInitialValue(state.states, state.initial),
    };
  }

  // If parallel state, resolve all regions
  if (state.type === "parallel" && state.states) {
    const regions: Record<string, StateValue> = {};
    for (const [regionName, regionState] of Object.entries(state.states)) {
      if (regionState.initial && regionState.states) {
        regions[regionName] = resolveInitialValue(regionState.states, regionState.initial);
      } else {
        regions[regionName] = regionName;
      }
    }
    return { [initial]: regions };
  }

  return initial;
}

/**
 * Collect metadata from all active states
 */
function collectMeta(
  states: Record<string, StateNode>,
  value: StateValue
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  if (typeof value === "string") {
    const state = states[value];
    if (state?.meta) {
      Object.assign(meta, { [value]: state.meta });
    }
  } else {
    for (const [key, childValue] of Object.entries(value)) {
      const state = states[key];
      if (state?.meta) {
        Object.assign(meta, { [key]: state.meta });
      }
      if (state?.states) {
        Object.assign(meta, collectMeta(state.states, childValue));
      }
    }
  }

  return meta;
}

/**
 * Get the string representation of a state value
 */
export function toStateString(value: StateValue): string {
  if (typeof value === "string") return value;

  const parts: string[] = [];
  for (const [key, childValue] of Object.entries(value)) {
    const childStr = toStateString(childValue);
    parts.push(`${key}.${childStr}`);
  }
  return parts.join(", ");
}

/**
 * Check if the current state matches a pattern
 */
export function matchesState(current: StateValue, pattern: string): boolean {
  const patternParts = pattern.split(".");
  return matchesStateValue(current, patternParts);
}

function matchesStateValue(value: StateValue, parts: string[]): boolean {
  if (parts.length === 0) return true;

  const first = parts[0];
  const rest = parts.slice(1);

  if (first === undefined) return true;

  if (typeof value === "string") {
    return first === value && rest.length === 0;
  }

  if (first in value) {
    return matchesStateValue(value[first]!, rest);
  }

  return false;
}

/**
 * Get the active state node(s) from a machine definition
 */
export function getActiveStateNodes(machine: Machine, value: StateValue): StateNode[] {
  return getStateNodes(machine.states, value);
}

function getStateNodes(states: Record<string, StateNode>, value: StateValue): StateNode[] {
  const nodes: StateNode[] = [];

  if (typeof value === "string") {
    const state = states[value];
    if (state) nodes.push(state);
  } else {
    for (const [key, childValue] of Object.entries(value)) {
      const state = states[key];
      if (state) {
        nodes.push(state);
        if (state.states) {
          nodes.push(...getStateNodes(state.states, childValue));
        }
      }
    }
  }

  return nodes;
}

/**
 * Get leaf state names from a state value
 */
export function getLeafStates(value: StateValue): string[] {
  if (typeof value === "string") return [value];

  const leaves: string[] = [];
  for (const childValue of Object.values(value)) {
    leaves.push(...getLeafStates(childValue));
  }
  return leaves;
}
