/**
 * Selectors for state-machine - re-exported from @ouni/expressions.
 *
 * The expressions package provides the core selector functionality.
 * State-machine's SignalStore extends ContextStore, so it works with
 * the generic selectors from expressions.
 */
export {
  createSelector,
  createSelectors,
  disposeSelectors,
  type ComputedSelector,
  type CreateSelectorsOptions,
  type SelectorsFromDefinitions,
} from "@ouni/expressions";
