import { signal, batch, effect, type Signal, type ReadonlySignal } from "@preact/signals-core";
import { type CompiledExpression as EngineCompiledExpression, evaluateCompiled, type ExpressionFunctionRegistry } from "@statepack/expressions";
import type { SignalContext, SignalScope } from "../signals";

/**
 * Result of a reactive binding
 */
export interface ReactiveBinding<T = unknown> {
  readonly value: ReadonlySignal<T | undefined>;
  readonly loading: ReadonlySignal<boolean>;
  readonly error: ReadonlySignal<Error | undefined>;
  dispose(): void;
}

/**
 * Create a reactive binding from a compiled expression and signal scope.
 */
function createBindingFromCompiled<TContext extends Record<string, unknown>>(
  compiled: EngineCompiledExpression,
  signalScope: SignalScope<TContext>,
  functions?: ExpressionFunctionRegistry
): ReactiveBinding {
  const value = signal<unknown>(undefined);
  const loading = signal(true);
  const error = signal<Error | undefined>(undefined);

  const disposeEffect = effect(() => {
    // Track all context signals
    for (const sig of Object.values(signalScope.context)) {
      void (sig as Signal<unknown>).value;
    }
    // Track query signals
    if (signalScope.queries) {
      for (const sig of Object.values(signalScope.queries)) {
        void (sig as Signal<unknown>).value;
      }
    }

    loading.value = true;
    error.value = undefined;

    // Build plain scope for evaluation
    const scope: Record<string, unknown> = { context: {} };
    for (const [key, sig] of Object.entries(signalScope.context)) {
      (scope.context as Record<string, unknown>)[key] = (sig as Signal<unknown>).value;
    }
    if (signalScope.queries) {
      scope.queries = {};
      for (const [key, sig] of Object.entries(signalScope.queries)) {
        (scope.queries as Record<string, unknown>)[key] = (sig as Signal<unknown>).value;
      }
    }

    evaluateCompiled(compiled, scope, { functions })
      .then((result) => {
        value.value = result;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err : new Error(String(err));
      })
      .finally(() => {
        loading.value = false;
      });
  });

  return {
    value: value as ReadonlySignal<unknown>,
    loading: loading as ReadonlySignal<boolean>,
    error: error as ReadonlySignal<Error | undefined>,
    dispose: disposeEffect,
  };
}

import type { CompiledStore, CompiledSlice } from "./index";

/**
 * Signal-based store instance for fine-grained reactivity.
 *
 * Each context field becomes an independent signal, enabling:
 * - Fine-grained updates (only affected fields trigger re-renders)
 * - Batched mutations (multiple updates in single notification)
 * - Reactive queries (auto-re-evaluate when dependencies change)
 */
export interface SignalStoreInstance {
  /** Compiled store definition */
  compiled: CompiledStore;
  expressionFunctions?: ExpressionFunctionRegistry;
  /** Signal-wrapped context per slice */
  contexts: Map<string, SignalContext<Record<string, unknown>>>;
  /** Reactive query bindings per slice */
  queries: Map<string, Map<string, ReactiveBinding>>;
  /** Parent store for scope resolution */
  parent?: SignalStoreInstance;
  /** Root store reference */
  root?: SignalStoreInstance;
  /** Store name for $name resolution */
  name?: string;
}

/**
 * Create a signal-based store instance from a compiled store.
 *
 * @example
 * ```typescript
 * const compiled = compileStore({ counter: { context: { count: 0 } } });
 * const store = createSignalStoreInstance(compiled);
 *
 * // Access signal directly
 * store.contexts.get("counter")!.count.value; // 0
 *
 * // Update triggers fine-grained reactivity
 * updateSignalContext(store, "counter", { count: 1 });
 * ```
 */
export function createSignalStoreInstance(
  compiled: CompiledStore,
  options?: { parent?: SignalStoreInstance; name?: string; expressionFunctions?: ExpressionFunctionRegistry }
): SignalStoreInstance {
  const contexts = new Map<string, SignalContext<Record<string, unknown>>>();
  const queries = new Map<string, Map<string, ReactiveBinding>>();

  // Initialize signal contexts from slice definitions
  for (const [sliceName, slice] of compiled.slices) {
    const signalContext: SignalContext<Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(slice.definition.context ?? {})) {
      signalContext[key] = signal(value);
    }
    contexts.set(sliceName, signalContext);
  }

  const instance: SignalStoreInstance = {
    compiled,
    expressionFunctions: options?.expressionFunctions,
    contexts,
    queries,
    parent: options?.parent,
    name: options?.name,
  };

  // Set root reference (either parent's root or self if no parent)
  instance.root = options?.parent?.root ?? options?.parent ?? instance;

  // Initialize reactive queries after instance is created
  for (const [sliceName, slice] of compiled.slices) {
    const sliceQueries = new Map<string, ReactiveBinding>();
    if (slice.definition.queries) {
      for (const [queryName, queryExpr] of Object.entries(slice.definition.queries)) {
        const expr = slice.expressions.get(queryExpr);
        if (expr) {
          const signalScope = buildSignalScope(instance, sliceName);
          const binding = createBindingFromCompiled(expr.compiled, signalScope, instance.expressionFunctions);
          sliceQueries.set(queryName, binding);
        }
      }
    }
    queries.set(sliceName, sliceQueries);
  }

  return instance;
}

/**
 * Get plain values from signal context.
 * Use this when you need a snapshot for expression evaluation.
 */
export function getSignalContextSnapshot(
  store: SignalStoreInstance,
  sliceName: string
): Record<string, unknown> {
  const ctx = store.contexts.get(sliceName);
  if (!ctx) return {};

  const values: Record<string, unknown> = {};
  for (const [key, sig] of Object.entries(ctx)) {
    values[key] = sig.value;
  }
  return values;
}

/**
 * Get merged context from all slices as plain values, including query results.
 */
export function getSignalStoreSnapshot(store: SignalStoreInstance): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const sliceName of store.contexts.keys()) {
    Object.assign(merged, getSignalContextSnapshot(store, sliceName));
  }
  // Include query values
  for (const sliceQueries of store.queries.values()) {
    for (const [queryName, binding] of sliceQueries) {
      merged[queryName] = binding.value.value;
    }
  }
  return merged;
}

/**
 * Update signal context with automatic batching.
 * All updates within a single call are batched together.
 */
export function updateSignalContext(
  store: SignalStoreInstance,
  sliceName: string,
  updates: Record<string, unknown>
): void {
  const ctx = store.contexts.get(sliceName);
  if (!ctx) return;

  batch(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (ctx[key]) {
        ctx[key].value = value;
      } else {
        // New field - create signal
        ctx[key] = signal(value);
      }
    }
  });
}

/**
 * Build a SignalScope for expression evaluation.
 * The scope includes the current slice's context and queries as signals.
 */
export function buildSignalScope(
  store: SignalStoreInstance,
  sliceName: string
): SignalScope<Record<string, unknown>> {
  const ctx = store.contexts.get(sliceName);
  const sliceQueries = store.queries.get(sliceName);

  // Build queries object with signal values
  const queries: Record<string, Signal<unknown>> = {};
  if (sliceQueries) {
    for (const [queryName, binding] of sliceQueries) {
      queries[queryName] = binding.value;
    }
  }

  return {
    context: ctx ?? {},
    queries,
  };
}

/**
 * Build a plain scope for expression evaluation (for mutations).
 * This returns a snapshot of the current values, not signals.
 */
export function buildPlainScope(
  store: SignalStoreInstance,
  sliceName: string,
  event?: Record<string, unknown>,
  namedStores?: Map<string, SignalStoreInstance>
): Record<string, unknown> {
  // Build queries object with current values
  const queries: Record<string, unknown> = {};
  const sliceQueries = store.queries.get(sliceName);
  if (sliceQueries) {
    for (const [queryName, binding] of sliceQueries) {
      queries[queryName] = binding.value.value;
    }
  }

  const scope: Record<string, unknown> = {
    context: getSignalContextSnapshot(store, sliceName),
    queries,
    event: event ?? {},
  };

  // Add $context (all slices in current store)
  const $context: Record<string, unknown> = {};
  for (const [name, ctx] of store.contexts) {
    const sliceSnapshot: Record<string, unknown> = {};
    for (const [key, sig] of Object.entries(ctx)) {
      sliceSnapshot[key] = sig.value;
    }
    $context[name] = sliceSnapshot;
  }
  scope.$context = $context;

  // Add $parent (if exists)
  if (store.parent) {
    const $parent: Record<string, unknown> = {};
    for (const [name, ctx] of store.parent.contexts) {
      const sliceSnapshot: Record<string, unknown> = {};
      for (const [key, sig] of Object.entries(ctx)) {
        sliceSnapshot[key] = sig.value;
      }
      $parent[name] = sliceSnapshot;
    }
    scope.$parent = $parent;
  }

  // Add $root
  const root = store.root ?? store;
  const $root: Record<string, unknown> = {};
  for (const [name, ctx] of root.contexts) {
    const sliceSnapshot: Record<string, unknown> = {};
    for (const [key, sig] of Object.entries(ctx)) {
      sliceSnapshot[key] = sig.value;
    }
    $root[name] = sliceSnapshot;
  }
  scope.$root = $root;

  // Add named stores
  if (namedStores) {
    for (const [name, namedStore] of namedStores) {
      if (namedStore.contexts.size === 1) {
        const [entry] = [...namedStore.contexts.entries()];
        if (entry) {
          const sliceSnapshot: Record<string, unknown> = {};
          for (const [key, sig] of Object.entries(entry[1])) {
            sliceSnapshot[key] = sig.value;
          }
          scope[`$${name}`] = sliceSnapshot;
        }
      } else {
        const namedContext: Record<string, unknown> = {};
        for (const [slName, ctx] of namedStore.contexts) {
          const sliceSnapshot: Record<string, unknown> = {};
          for (const [key, sig] of Object.entries(ctx)) {
            sliceSnapshot[key] = sig.value;
          }
          namedContext[slName] = sliceSnapshot;
        }
        scope[`$${name}`] = namedContext;
      }
    }
  }

  return scope;
}

/**
 * Execute a mutation from a slice.
 * Evaluates mutation expressions and updates signal context.
 */
export async function executeSignalMutation(
  store: SignalStoreInstance,
  sliceName: string,
  mutationName: string,
  event?: Record<string, unknown>,
  namedStores?: Map<string, SignalStoreInstance>
): Promise<Record<string, unknown>> {
  const slice = store.compiled.slices.get(sliceName);
  if (!slice) {
    throw new Error(`Slice not found: ${sliceName}`);
  }

  const mutation = slice.definition.mutations?.[mutationName];
  if (!mutation) {
    throw new Error(`Mutation not found: ${sliceName}.${mutationName}`);
  }

  const scope = buildPlainScope(store, sliceName, event, namedStores);
  const results: Record<string, unknown> = {};

  for (const [contextKey, exprString] of Object.entries(mutation)) {
    const expr = slice.expressions.get(exprString);
    if (!expr) {
      throw new Error(
        `Compiled expression not found for mutation ${sliceName}.${mutationName}.${contextKey}`
      );
    }

    // Handle scoped mutations (e.g., "$parent.todos.items")
    if (contextKey.startsWith("$")) {
      const resolved = resolveSignalScope(store, contextKey, namedStores);
      if (resolved) {
        const value = await evaluateCompiled(expr.compiled, scope, { functions: store.expressionFunctions });
        const targetContext = resolved.store.contexts.get(resolved.sliceName);
        if (targetContext && resolved.path.length > 0) {
          setNestedSignalValue(targetContext, resolved.path, value);
        }
      }
    } else {
      // Local context mutation
      results[contextKey] = await evaluateCompiled(expr.compiled, scope, { functions: store.expressionFunctions });
    }
  }

  // Update local context with results using batched signal updates
  if (Object.keys(results).length > 0) {
    updateSignalContext(store, sliceName, results);
  }

  return results;
}

/**
 * Scope resolution result for signal stores
 */
interface ResolvedSignalScope {
  store: SignalStoreInstance;
  sliceName: string;
  path: string[];
}

/**
 * Parse a scoped path like "$parent.todos.items" and resolve to target store
 */
function resolveSignalScope(
  store: SignalStoreInstance,
  path: string,
  namedStores?: Map<string, SignalStoreInstance>
): ResolvedSignalScope | undefined {
  const parts = path.split(".");
  const prefix = parts[0];

  if (!prefix) return undefined;

  // $context.sliceName.path
  if (prefix === "$context") {
    const sliceName = parts[1];
    if (sliceName && store.contexts.has(sliceName)) {
      return { store, sliceName, path: parts.slice(2) };
    }
    if (store.contexts.size === 1) {
      const [onlySlice] = store.contexts.keys();
      return { store, sliceName: onlySlice!, path: parts.slice(1) };
    }
    return undefined;
  }

  // $parent.sliceName.path
  if (prefix === "$parent") {
    if (!store.parent) return undefined;
    const sliceName = parts[1];
    if (sliceName && store.parent.contexts.has(sliceName)) {
      return { store: store.parent, sliceName, path: parts.slice(2) };
    }
    return undefined;
  }

  // $root.sliceName.path
  if (prefix === "$root") {
    const root = store.root ?? store;
    const sliceName = parts[1];
    if (sliceName && root.contexts.has(sliceName)) {
      return { store: root, sliceName, path: parts.slice(2) };
    }
    return undefined;
  }

  // $[name].path - named store
  if (prefix.startsWith("$")) {
    const name = prefix.slice(1);
    const named = namedStores?.get(name);
    if (named) {
      if (named.contexts.size === 1) {
        const [sliceName] = named.contexts.keys();
        return { store: named, sliceName: sliceName!, path: parts.slice(1) };
      }
      if (named.contexts.has(name)) {
        return { store: named, sliceName: name, path: parts.slice(1) };
      }
    }
    return undefined;
  }

  return undefined;
}

/**
 * Set a nested value in a signal context
 */
function setNestedSignalValue(
  ctx: SignalContext<Record<string, unknown>>,
  path: string[],
  value: unknown
): void {
  if (path.length === 0) return;

  // For single-level path, update the signal directly
  if (path.length === 1) {
    const key = path[0]!;
    if (ctx[key]) {
      ctx[key].value = value;
    } else {
      ctx[key] = signal(value);
    }
    return;
  }

  // For nested paths, we need to update the entire object
  const rootKey = path[0]!;
  const rootSignal = ctx[rootKey];
  if (!rootSignal) return;

  const rootValue = rootSignal.value;
  if (typeof rootValue !== "object" || rootValue === null) return;

  // Clone and set nested value
  const cloned = structuredClone(rootValue) as Record<string, unknown>;
  let current = cloned;

  for (let i = 1; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = path[path.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }

  rootSignal.value = cloned;
}

/**
 * Evaluate a query from a slice using reactive binding.
 * Returns the current value (may be undefined if still loading).
 */
export function getSignalQueryValue(
  store: SignalStoreInstance,
  sliceName: string,
  queryName: string
): unknown {
  const sliceQueries = store.queries.get(sliceName);
  if (!sliceQueries) return undefined;

  const binding = sliceQueries.get(queryName);
  if (!binding) return undefined;

  return binding.value.value;
}

/**
 * Get a reactive binding for a query.
 * Use this to subscribe to query updates.
 */
export function getSignalQueryBinding(
  store: SignalStoreInstance,
  sliceName: string,
  queryName: string
): ReactiveBinding | undefined {
  const sliceQueries = store.queries.get(sliceName);
  if (!sliceQueries) return undefined;
  return sliceQueries.get(queryName);
}

/**
 * Dispose all reactive bindings in a store.
 * Call this when the store is no longer needed.
 */
export function disposeSignalStore(store: SignalStoreInstance): void {
  for (const sliceQueries of store.queries.values()) {
    for (const binding of sliceQueries.values()) {
      binding.dispose();
    }
  }
  store.queries.clear();
}
