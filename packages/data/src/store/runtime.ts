import { evaluateCompiled } from "@ouni/expressions";
import type { CompiledStore } from "./index";

/**
 * Runtime store instance with live context values
 */
export interface StoreInstance {
  /** Compiled store definition */
  compiled: CompiledStore;
  /** Live context values per slice */
  contexts: Map<string, Record<string, unknown>>;
  /** Parent store for scope resolution */
  parent?: StoreInstance;
  /** Name of this store (for $[name] resolution) */
  name?: string;
  /** Root store reference */
  root?: StoreInstance;
}

/**
 * Create a store instance from a compiled store
 */
export function createStoreInstance(
  compiled: CompiledStore,
  options?: {
    parent?: StoreInstance;
    name?: string;
  }
): StoreInstance {
  const contexts = new Map<string, Record<string, unknown>>();

  // Initialize contexts from slice definitions
  for (const [sliceName, slice] of compiled.slices) {
    contexts.set(sliceName, { ...(slice.definition.context ?? {}) });
  }

  const instance: StoreInstance = {
    compiled,
    contexts,
    parent: options?.parent,
    name: options?.name,
  };

  // Set root reference (either parent's root or self if no parent)
  instance.root = options?.parent?.root ?? options?.parent ?? instance;

  return instance;
}

/**
 * Get a slice's context from the store
 */
export function getSliceContext(
  store: StoreInstance,
  sliceName: string
): Record<string, unknown> | undefined {
  return store.contexts.get(sliceName);
}

/**
 * Update a slice's context
 */
export function updateSliceContext(
  store: StoreInstance,
  sliceName: string,
  updates: Record<string, unknown>
): void {
  const current = store.contexts.get(sliceName);
  if (current) {
    store.contexts.set(sliceName, { ...current, ...updates });
  }
}

/**
 * Scope resolution result
 */
interface ResolvedScope {
  store: StoreInstance;
  sliceName: string;
  path: string[];
}

/**
 * Parse a scoped path like "$parent.todos.items" or "$cart.items"
 * Returns the resolved store, slice, and remaining path
 */
export function resolveScope(
  store: StoreInstance,
  path: string,
  namedStores?: Map<string, StoreInstance>
): ResolvedScope | undefined {
  const parts = path.split(".");
  const prefix = parts[0];

  if (!prefix) return undefined;

  // $context.sliceName.path or $context.path (if single slice)
  if (prefix === "$context") {
    const sliceName = parts[1];
    if (sliceName && store.contexts.has(sliceName)) {
      return { store, sliceName, path: parts.slice(2) };
    }
    // If only one slice, assume it's the target
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

  // $[name].path - named store (without slice, whole store is the slice)
  // e.g., $cart.items where "cart" is a named store
  if (prefix.startsWith("$")) {
    const name = prefix.slice(1); // remove $
    const named = namedStores?.get(name);
    if (named) {
      // Named stores are single-slice by convention
      if (named.contexts.size === 1) {
        const [sliceName] = named.contexts.keys();
        return { store: named, sliceName: sliceName!, path: parts.slice(1) };
      }
      // Or treat the name as the slice name
      if (named.contexts.has(name)) {
        return { store: named, sliceName: name, path: parts.slice(1) };
      }
    }
    return undefined;
  }

  return undefined;
}

/**
 * Build a runtime scope for expression evaluation
 * Includes $context, $parent, $root, and named stores
 */
export function buildScope(
  store: StoreInstance,
  sliceName: string,
  event?: Record<string, unknown>,
  namedStores?: Map<string, StoreInstance>
): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    // Current slice context is available directly
    context: store.contexts.get(sliceName) ?? {},
    event: event ?? {},
  };

  // Add $context (all slices in current store)
  const $context: Record<string, unknown> = {};
  for (const [name, ctx] of store.contexts) {
    $context[name] = ctx;
  }
  scope.$context = $context;

  // Add $parent (if exists)
  if (store.parent) {
    const $parent: Record<string, unknown> = {};
    for (const [name, ctx] of store.parent.contexts) {
      $parent[name] = ctx;
    }
    scope.$parent = $parent;
  }

  // Add $root
  const root = store.root ?? store;
  const $root: Record<string, unknown> = {};
  for (const [name, ctx] of root.contexts) {
    $root[name] = ctx;
  }
  scope.$root = $root;

  // Add named stores
  if (namedStores) {
    for (const [name, namedStore] of namedStores) {
      // For single-slice stores, expose context directly
      if (namedStore.contexts.size === 1) {
        const entry = [...namedStore.contexts.entries()][0];
        if (entry) {
          scope[`$${name}`] = entry[1];
        }
      } else {
        // Multi-slice: expose as object
        const namedContext: Record<string, unknown> = {};
        for (const [slName, ctx] of namedStore.contexts) {
          namedContext[slName] = ctx;
        }
        scope[`$${name}`] = namedContext;
      }
    }
  }

  return scope;
}

/**
 * Evaluate a query from a slice
 */
export async function evaluateSliceQuery<T = unknown>(
  store: StoreInstance,
  sliceName: string,
  queryName: string,
  event?: Record<string, unknown>,
  namedStores?: Map<string, StoreInstance>
): Promise<T> {
  const slice = store.compiled.slices.get(sliceName);
  if (!slice) {
    throw new Error(`Slice not found: ${sliceName}`);
  }

  const queryExpr = slice.definition.queries?.[queryName];
  if (!queryExpr) {
    throw new Error(`Query not found: ${sliceName}.${queryName}`);
  }

  const expr = slice.expressions.get(queryExpr);
  if (!expr) {
    throw new Error(`Compiled expression not found for query: ${sliceName}.${queryName}`);
  }

  const scope = buildScope(store, sliceName, event, namedStores);
  return evaluateCompiled(expr.compiled, scope) as Promise<T>;
}

/**
 * Execute a mutation from a slice
 */
export async function executeSliceMutation(
  store: StoreInstance,
  sliceName: string,
  mutationName: string,
  event?: Record<string, unknown>,
  namedStores?: Map<string, StoreInstance>
): Promise<Record<string, unknown>> {
  const slice = store.compiled.slices.get(sliceName);
  if (!slice) {
    throw new Error(`Slice not found: ${sliceName}`);
  }

  const mutation = slice.definition.mutations?.[mutationName];
  if (!mutation) {
    throw new Error(`Mutation not found: ${sliceName}.${mutationName}`);
  }

  const scope = buildScope(store, sliceName, event, namedStores);
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
      const resolved = resolveScope(store, contextKey, namedStores);
      if (resolved) {
        const value = await evaluateCompiled(expr.compiled, scope);
        const targetContext = resolved.store.contexts.get(resolved.sliceName);
        if (targetContext && resolved.path.length > 0) {
          // Set nested path
          setNestedValue(targetContext, resolved.path, value);
        }
      }
    } else {
      // Local context mutation
      results[contextKey] = await evaluateCompiled(expr.compiled, scope);
    }
  }

  // Update local context with results
  if (Object.keys(results).length > 0) {
    updateSliceContext(store, sliceName, results);
  }

  return results;
}

/**
 * Set a nested value in an object
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;

  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
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
}
