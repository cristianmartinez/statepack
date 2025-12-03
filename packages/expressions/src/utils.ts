import type { Scope } from "./types";

/**
 * Known scope prefixes for path detection
 */
const SCOPE_PREFIXES = [
  "context.",
  "params.",
  "loaderData.",
  "event.",
  "item.",
  "index",
  "state.",
];

/**
 * Get a value from an object using dot notation path
 * Supports: dot notation, array indices, optional chaining
 */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;

  // Handle optional chaining syntax
  const isOptional = path.includes("?.");
  const normalizedPath = path.replace(/\?\./g, ".").replace(/\?\[/g, "[");

  const parts = splitPath(normalizedPath);
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return isOptional ? undefined : current;
    }

    // Handle array index notation like [0] or [-1]
    const indexMatch = part.match(/^\[(-?\d+)\]$/);
    if (indexMatch) {
      if (!Array.isArray(current)) {
        return isOptional ? undefined : undefined;
      }
      const index = parseInt(indexMatch[1]!, 10);
      current = index < 0 ? current[current.length + index] : current[index];
      continue;
    }

    // Handle property.index notation like items[0]
    const propIndexMatch = part.match(/^(\w+)\[(-?\d+)\]$/);
    if (propIndexMatch) {
      const [, prop, indexStr] = propIndexMatch;
      current = (current as Record<string, unknown>)[prop!];
      if (!Array.isArray(current)) {
        return isOptional ? undefined : undefined;
      }
      const index = parseInt(indexStr!, 10);
      current = index < 0 ? current[current.length + index] : current[index];
      continue;
    }

    // Regular property access
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Split a path into parts, handling array indices
 */
function splitPath(path: string): string[] {
  const parts: string[] = [];
  let current = "";

  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;

    if (char === ".") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else if (char === "[") {
      if (current) {
        parts.push(current);
        current = "";
      }
      // Find matching ]
      const endBracket = path.indexOf("]", i);
      if (endBracket === -1) {
        current += char;
      } else {
        parts.push(path.slice(i, endBracket + 1));
        i = endBracket;
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Set a value at a path in an object (immutably)
 */
export function setPath(obj: unknown, path: string, value: unknown): unknown {
  if (!path) return value;

  const parts = splitPath(path.replace(/\?\./g, "."));

  function setRecursive(current: unknown, index: number): unknown {
    if (index >= parts.length) return value;

    const part = parts[index]!;

    // Handle array index
    const indexMatch = part.match(/^\[(-?\d+)\]$/);
    if (indexMatch) {
      const arr = Array.isArray(current) ? [...current] : [];
      let idx = parseInt(indexMatch[1]!, 10);
      if (idx < 0) idx = arr.length + idx;
      arr[idx] = setRecursive(arr[idx], index + 1);
      return arr;
    }

    // Handle property with index
    const propIndexMatch = part.match(/^(\w+)\[(-?\d+)\]$/);
    if (propIndexMatch) {
      const [, prop, idxStr] = propIndexMatch;
      const obj = current && typeof current === "object" ? { ...current as Record<string, unknown> } : {};
      const arr = Array.isArray(obj[prop!]) ? [...obj[prop!] as unknown[]] : [];
      let idx = parseInt(idxStr!, 10);
      if (idx < 0) idx = arr.length + idx;
      arr[idx] = setRecursive(arr[idx], index + 1);
      obj[prop!] = arr;
      return obj;
    }

    // Regular property
    const obj = current && typeof current === "object" ? { ...current as Record<string, unknown> } : {};
    obj[part] = setRecursive(obj[part], index + 1);
    return obj;
  }

  return setRecursive(obj, 0);
}

/**
 * Check if a string looks like a path reference (starts with scope prefix)
 */
export function isPathReference(str: string): boolean {
  return SCOPE_PREFIXES.some((prefix) => str.startsWith(prefix)) || str === "index";
}

/**
 * Resolve a path from scope
 */
export function resolveFromScope(path: string, scope: Scope): unknown {
  // Direct scope property access
  if (path === "index") return scope.index;
  if (path === "item") return scope.item;

  // Check each scope
  for (const scopeKey of ["context", "params", "loaderData", "event", "state"] as const) {
    if (path.startsWith(`${scopeKey}.`)) {
      const subPath = path.slice(scopeKey.length + 1);
      return getPath(scope[scopeKey], subPath);
    }
    if (path === scopeKey) {
      return scope[scopeKey];
    }
  }

  // Item scope (for iterations)
  if (path.startsWith("item.")) {
    return getPath(scope.item, path.slice(5));
  }

  // Fallback to context
  return getPath(scope.context, path);
}
