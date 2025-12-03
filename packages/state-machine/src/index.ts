/**
 * @ouni/state-machine
 *
 * XState-inspired declarative state machine for mini-apps
 */

// Schema exports
export {
  GuardSchema,
  ActionSchema,
  ActionsSchema,
  TransitionSchema,
  TransitionsSchema,
  InvokeSchema,
  StateNodeSchema,
  GuardDefinitionSchema,
  MachineSchema,
  MiniAppSchema,
  type Action,
  type Actions,
  type Transition,
  type Transitions,
  type Invoke,
  type StateNode,
  type GuardDefinition,
  type Machine,
  type MiniApp,
  validateMachine,
  validateMiniApp,
  isMachine,
  isMiniApp,
  assertMachine,
  assertMiniApp,
  type ValidationResult,
} from "./schema/index";

// Interpreter exports
export {
  type State,
  type StateValue,
  type Event,
  createInitialState,
  matchesState,
  toStateString,
  getActiveStateNodes,
  getLeafStates,
  type GuardContext,
  evaluateGuard,
  findMatchingTransition,
  createGuardContext,
  type ActionContext,
  type ActionResult,
  type ActionEffect,
  type ActionExecutor,
  executeActions,
  normalizeActions,
  Interpreter,
  interpret,
  type InterpreterOptions,
} from "./interpreter/index";
