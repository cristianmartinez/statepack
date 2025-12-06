import type { CompiledJSONataExpression } from "../evaluate";
import type { SignalScope, SignalLike } from "./types";

/**
 * Build a plain scope object from signal context.
 * Reading signal values here tracks dependencies when called inside an effect.
 */
export function buildScopeFromSignals<TContext extends Record<string, unknown>>(
  signalScope: SignalScope<TContext>
): {
  context: TContext;
  selectors: Record<string, unknown>;
  queries: Record<string, unknown>;
  state?: unknown;
} {
  const context = {} as TContext;

  // Read all context signals - this tracks dependencies in effects
  for (const [key, sig] of Object.entries(signalScope.context)) {
    (context as Record<string, unknown>)[key] = (sig as SignalLike).value;
  }

  // Read all selector values if present
  const selectors: Record<string, unknown> = {};
  if (signalScope.selectors) {
    for (const [key, selector] of Object.entries(signalScope.selectors)) {
      selectors[key] = selector.value.value;
    }
  }

  // Read all query values if present
  const queries: Record<string, unknown> = {};
  if (signalScope.queries) {
    for (const [key, query] of Object.entries(signalScope.queries)) {
      queries[key] = query.value;
    }
  }

  // Read state signal if present (for state machine integrations)
  const state = signalScope.state?.value;

  return { context, selectors, queries, state };
}

/**
 * Evaluate a compiled expression with signal-based scope.
 * This reads signal values synchronously to build the scope,
 * then evaluates the expression asynchronously.
 *
 * Call this inside an effect() to track which signals the expression depends on.
 */
export async function evaluateWithSignals<TContext extends Record<string, unknown>>(
  compiled: CompiledJSONataExpression,
  signalScope: SignalScope<TContext>
): Promise<unknown> {
  // Build plain scope by reading signals (tracks dependencies)
  const scope = buildScopeFromSignals(signalScope);

  // Evaluate expression with plain scope
  try {
    return await compiled.expression.evaluate(scope, {});
  } catch (err) {
    throw new Error(
      `Expression evaluation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Track all signals in a scope by reading their values.
 * Use this inside an effect() to ensure re-evaluation when any signal changes.
 */
export function trackSignals<TContext extends Record<string, unknown>>(
  signalScope: SignalScope<TContext>
): void {
  // Read all context signals to track them
  for (const [, sig] of Object.entries(signalScope.context)) {
    (sig as SignalLike).value;
  }

  // Read all selector values if present
  if (signalScope.selectors) {
    for (const [, selector] of Object.entries(signalScope.selectors)) {
      selector.value.value;
    }
  }

  // Read all query values if present
  if (signalScope.queries) {
    for (const [, query] of Object.entries(signalScope.queries)) {
      query.value;
    }
  }

  // Read state signal if present
  if (signalScope.state) {
    signalScope.state.value;
  }
}
