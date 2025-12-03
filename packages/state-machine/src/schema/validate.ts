import { TypeCompiler } from "@sinclair/typebox/compiler";
import { MachineSchema, MiniAppSchema, type Machine, type MiniApp } from "./types";

const machineValidator = TypeCompiler.Compile(MachineSchema);
const miniAppValidator = TypeCompiler.Compile(MiniAppSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function formatError(error: { path: string; message: string }): string {
  return `${error.path}: ${error.message}`;
}

export function validateMachine(machine: unknown): ValidationResult {
  const valid = machineValidator.Check(machine);
  if (valid) {
    return validateMachineSemantics(machine as Machine);
  }
  const errors = [...machineValidator.Errors(machine)].map((e) => formatError({
    path: e.path,
    message: e.message,
  }));
  return { valid: false, errors };
}

export function validateMiniApp(app: unknown): ValidationResult {
  const valid = miniAppValidator.Check(app);
  if (valid) {
    return validateMiniAppSemantics(app as MiniApp);
  }
  const errors = [...miniAppValidator.Errors(app)].map((e) => formatError({
    path: e.path,
    message: e.message,
  }));
  return { valid: false, errors };
}

function validateMachineSemantics(machine: Machine): ValidationResult {
  const errors: string[] = [];
  const stateIds = new Set<string>();
  const stateNames = new Set<string>();

  // Collect all state names and IDs
  function collectStates(states: Record<string, unknown>, path: string) {
    for (const [name, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${name}` : name;
      stateNames.add(statePath);

      const stateObj = state as Record<string, unknown>;
      if (stateObj.id && typeof stateObj.id === "string") {
        if (stateIds.has(stateObj.id)) {
          errors.push(`Duplicate state ID: ${stateObj.id}`);
        }
        stateIds.add(stateObj.id);
      }

      if (stateObj.states && typeof stateObj.states === "object") {
        collectStates(stateObj.states as Record<string, unknown>, statePath);
      }
    }
  }

  collectStates(machine.states, "");

  // Validate initial state exists
  if (!stateNames.has(machine.initial)) {
    errors.push(`Initial state "${machine.initial}" does not exist`);
  }

  // Validate nested initial states
  function validateInitials(states: Record<string, unknown>, path: string) {
    for (const [name, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${name}` : name;
      const stateObj = state as Record<string, unknown>;

      if (stateObj.states && typeof stateObj.states === "object") {
        const nestedStates = stateObj.states as Record<string, unknown>;
        const initial = stateObj.initial as string | undefined;

        if (stateObj.type !== "parallel") {
          if (!initial) {
            errors.push(`State "${statePath}" has nested states but no initial state`);
          } else if (!nestedStates[initial]) {
            errors.push(`Initial state "${initial}" does not exist in "${statePath}"`);
          }
        }

        validateInitials(nestedStates, statePath);
      }
    }
  }

  validateInitials(machine.states, "");

  // Validate final states have no transitions
  function validateFinalStates(states: Record<string, unknown>, path: string) {
    for (const [name, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${name}` : name;
      const stateObj = state as Record<string, unknown>;

      if (stateObj.type === "final" && stateObj.on) {
        const onObj = stateObj.on as Record<string, unknown>;
        if (Object.keys(onObj).length > 0) {
          errors.push(`Final state "${statePath}" cannot have transitions`);
        }
      }

      if (stateObj.states && typeof stateObj.states === "object") {
        validateFinalStates(stateObj.states as Record<string, unknown>, statePath);
      }
    }
  }

  validateFinalStates(machine.states, "");

  return { valid: errors.length === 0, errors };
}

function validateMiniAppSemantics(app: MiniApp): ValidationResult {
  return validateMachineSemantics(app.machine);
}

export function isMachine(value: unknown): value is Machine {
  return machineValidator.Check(value);
}

export function isMiniApp(value: unknown): value is MiniApp {
  return miniAppValidator.Check(value);
}

export function assertMachine(value: unknown): asserts value is Machine {
  const result = validateMachine(value);
  if (!result.valid) {
    throw new Error(`Invalid machine: ${result.errors.join(", ")}`);
  }
}

export function assertMiniApp(value: unknown): asserts value is MiniApp {
  const result = validateMiniApp(value);
  if (!result.valid) {
    throw new Error(`Invalid mini-app: ${result.errors.join(", ")}`);
  }
}
