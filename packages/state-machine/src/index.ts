/**
 * @ouni/state-machine
 *
 * XState-inspired declarative state machine for mini-apps
 */

// Compiler exports
export {
  compileMachine,
  type CompiledCache,
  type CompiledMachine,
  isCompiledMachine,
} from "./compiler/index";
// Interpreter exports
export {
  type ActionContext,
  type ActionEffect,
  type ActionExecutor,
  type ActionResult,
  type ExecuteActionsOptions,
  createGuardContext,
  createInitialState,
  type Event,
  evaluateGuard,
  executeActions,
  findMatchingTransition,
  type GuardContext,
  getActiveStateNodes,
  getLeafStates,
  matchesState,
  normalizeActions,
  type State,
  type StateValue,
  toStateString,
} from "./interpreter/index";
// Schema exports
export {
  type Action,
  ActionSchema,
  type Actions,
  ActionsSchema,
  assertMachine,
  assertMiniApp,
  type GuardDefinition,
  GuardDefinitionSchema,
  GuardSchema,
  type Invoke,
  InvokeSchema,
  isMachine,
  isMiniApp,
  type Machine,
  MachineSchema,
  type MiniApp,
  MiniAppSchema,
  type StateNode,
  StateNodeSchema,
  type Transition,
  TransitionSchema,
  type Transitions,
  TransitionsSchema,
  type ValidationResult,
  validateMachine,
  validateMiniApp,
} from "./schema/index";
// Signal store exports
export {
  type ComputedSelector,
  createSelector,
  createSelectors,
  createSignalStore,
  type CreateSelectorsOptions,
  type CreateSignalStoreOptions,
  disposeSelectors,
  interpretWithSignals,
  type MachineEvent,
  type SelectorSignal,
  type SelectorsFromDefinitions,
  type SignalContext,
  SignalInterpreter,
  type SignalInterpreterOptions,
  type SignalSelectors,
  type SignalStore,
  type SignalStoreSnapshot,
} from "./signals/index";
