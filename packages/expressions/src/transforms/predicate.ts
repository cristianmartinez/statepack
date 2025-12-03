import type { TransformFn, Scope } from "../types";
import { getPath } from "../utils";

/**
 * Advanced array transforms that use predicate expressions
 */
export const predicateTransforms: Record<string, TransformFn> = {
  where: (value, args, scope) => {
    if (!Array.isArray(value)) return value;
    const predicate = String(args[0] ?? "");
    return value.filter((item) => evaluatePredicate(predicate, item, scope));
  },

  whereNot: (value, args, scope) => {
    if (!Array.isArray(value)) return value;
    const predicate = String(args[0] ?? "");
    return value.filter((item) => !evaluatePredicate(predicate, item, scope));
  },

  findWhere: (value, args, scope) => {
    if (!Array.isArray(value)) return undefined;
    const predicate = String(args[0] ?? "");
    return value.find((item) => evaluatePredicate(predicate, item, scope));
  },

  removeWhere: (value, args, scope) => {
    if (!Array.isArray(value)) return value;
    const predicate = String(args[0] ?? "");
    return value.filter((item) => !evaluatePredicate(predicate, item, scope));
  },

  updateWhere: (value, args, scope) => {
    if (!Array.isArray(value)) return value;
    const predicate = String(args[0] ?? "");
    const key = String(args[1] ?? "");
    const newValue = args[2];

    return value.map((item) => {
      if (evaluatePredicate(predicate, item, scope)) {
        const resolvedValue = resolvePredicateArg(newValue, scope, item);
        return { ...item, [key]: resolvedValue };
      }
      return item;
    });
  },

  mapWith: (value, args, scope) => {
    if (!Array.isArray(value)) return value;
    const expr = String(args[0] ?? "");

    return value.map((item) => {
      // Simple property access
      if (/^[\w.]+$/.test(expr)) {
        return getPath(item, expr);
      }
      // For complex expressions, would need full expression evaluator
      return item;
    });
  },
};

/**
 * Evaluate a predicate expression against an item
 */
export function evaluatePredicate(
  predicate: string,
  item: unknown,
  scope: Scope
): boolean {
  const trimmed = predicate.trim();

  // Handle && (AND) - split and check all parts
  if (trimmed.includes("&&")) {
    return trimmed
      .split("&&")
      .every((part) => evaluatePredicate(part.trim(), item, scope));
  }

  // Handle || (OR) - split and check any part
  if (trimmed.includes("||")) {
    return trimmed
      .split("||")
      .some((part) => evaluatePredicate(part.trim(), item, scope));
  }

  // Handle negation
  if (trimmed.startsWith("!")) {
    return !evaluatePredicate(trimmed.slice(1).trim(), item, scope);
  }

  // Handle comparison operators
  const comparisonMatch = trimmed.match(
    /^([\w.]+)\s*(===?|!==?|>=?|<=?)\s*(.+)$/
  );
  if (comparisonMatch) {
    const [, propPath, op, rightStr] = comparisonMatch;
    const left = getPath(item, propPath!);
    const right = resolvePredicateArg(rightStr!.trim(), scope, item);

    switch (op) {
      case "===":
      case "==":
        return left === right;
      case "!==":
      case "!=":
        return left !== right;
      case ">":
        return (left as number) > (right as number);
      case ">=":
        return (left as number) >= (right as number);
      case "<":
        return (left as number) < (right as number);
      case "<=":
        return (left as number) <= (right as number);
    }
  }

  // Simple property check - truthy value
  if (/^[\w.]+$/.test(trimmed)) {
    return !!getPath(item, trimmed);
  }

  return false;
}

/**
 * Resolve a predicate argument that might be a path reference
 */
function resolvePredicateArg(
  arg: unknown,
  scope: Scope,
  item: unknown
): unknown {
  if (typeof arg !== "string") return arg;

  const str = arg.trim();

  // Path reference starting with $
  if (str.startsWith("$")) {
    const path = str.slice(1);

    // Special $item reference
    if (path === "item") return item;
    if (path.startsWith("item.")) {
      return getPath(item, path.slice(5));
    }

    // Scope references
    return getPath(scope, path);
  }

  // Quoted string literal
  if (
    (str.startsWith("'") && str.endsWith("'")) ||
    (str.startsWith('"') && str.endsWith('"'))
  ) {
    return str.slice(1, -1);
  }

  // Boolean literals
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;

  // Number
  const num = Number(str);
  if (!isNaN(num)) return num;

  // Return as string
  return str;
}
