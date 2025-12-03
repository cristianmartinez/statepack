import type { LiteralValue, RefValue, Scope, Value } from "./types";

/** Known scope prefixes for path detection */
const PATH_PREFIXES = ["context.", "params.", "loaderData.", "event.", "item.", "state."];

/**
 * Get a value from an object using dot notation path
 */
export function getPath(obj: unknown, path: string, optional = false): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return optional ? undefined : current;
    }

    // Handle array index notation like items[0]
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const key = match[1]!;
      const indexStr = match[2]!;
      const index = parseInt(indexStr, 10);
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return optional ? undefined : undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Check if a value looks like a path reference
 */
export function isPathLike(value: string): boolean {
  return PATH_PREFIXES.some((p) => value.startsWith(p)) || value === "index" || value === "item";
}

/**
 * Resolve a Value to its actual value
 */
export function resolveValue(value: Value, scope: Scope): unknown {
  // Explicit ref
  if (isRefValue(value)) {
    return getPath(scope, value.path, value.optional);
  }

  // Explicit literal
  if (isLiteralValue(value)) {
    return value.value;
  }

  // String shorthand: if it looks like a path, treat as ref
  if (typeof value === "string") {
    if (isPathLike(value)) {
      return getPath(scope, value);
    }
    // Otherwise it's a literal string
    return value;
  }

  // Primitive literal (number, boolean, null)
  return value;
}

/**
 * Type guard for RefValue
 */
export function isRefValue(value: unknown): value is RefValue {
  return typeof value === "object" && value !== null && (value as RefValue).type === "ref";
}

/**
 * Type guard for LiteralValue
 */
export function isLiteralValue(value: unknown): value is LiteralValue {
  return typeof value === "object" && value !== null && (value as LiteralValue).type === "literal";
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}
