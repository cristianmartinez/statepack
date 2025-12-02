import type { Scope, Value } from "./types.ts";
import { getPath, resolveValue } from "./utils.ts";

export type BuiltinFunction = (
  args: unknown[],
  scope: Scope
) => boolean | number;

/**
 * Built-in functions for the conditions engine
 */
export const builtinFunctions: Record<string, BuiltinFunction> = {
  // Array functions
  includes: (args) => {
    const [arr, item] = args;
    if (!Array.isArray(arr)) return false;
    return arr.includes(item);
  },

  length: (args) => {
    const [value] = args;
    if (Array.isArray(value)) return value.length;
    if (typeof value === "string") return value.length;
    return 0;
  },

  some: (args, scope) => {
    const [arr, property] = args;
    if (!Array.isArray(arr)) return false;
    if (typeof property !== "string") return false;
    return arr.some((item) => {
      const val = getPath({ item }, `item.${property}`);
      return !!val;
    });
  },

  every: (args, scope) => {
    const [arr, property] = args;
    if (!Array.isArray(arr)) return false;
    if (typeof property !== "string") return false;
    return arr.every((item) => {
      const val = getPath({ item }, `item.${property}`);
      return !!val;
    });
  },

  none: (args, scope) => {
    const [arr, property] = args;
    if (!Array.isArray(arr)) return false;
    if (typeof property !== "string") return false;
    return !arr.some((item) => {
      const val = getPath({ item }, `item.${property}`);
      return !!val;
    });
  },

  count: (args, scope) => {
    const [arr, property] = args;
    if (!Array.isArray(arr)) return 0;
    if (typeof property !== "string") return arr.length;
    return arr.filter((item) => {
      const val = getPath({ item }, `item.${property}`);
      return !!val;
    }).length;
  },

  // String functions
  startsWith: (args) => {
    const [str, prefix] = args;
    if (typeof str !== "string" || typeof prefix !== "string") return false;
    return str.startsWith(prefix);
  },

  endsWith: (args) => {
    const [str, suffix] = args;
    if (typeof str !== "string" || typeof suffix !== "string") return false;
    return str.endsWith(suffix);
  },

  contains: (args) => {
    const [str, substring] = args;
    if (typeof str !== "string" || typeof substring !== "string") return false;
    return str.includes(substring);
  },

  matches: (args) => {
    const [str, pattern] = args;
    if (typeof str !== "string" || typeof pattern !== "string") return false;
    try {
      const regex = new RegExp(pattern);
      return regex.test(str);
    } catch {
      return false;
    }
  },

  // Number functions
  between: (args) => {
    const [num, min, max] = args;
    if (typeof num !== "number") return false;
    if (typeof min !== "number" || typeof max !== "number") return false;
    return num >= min && num <= max;
  },

  // Date functions
  isPast: (args) => {
    const [timestamp] = args;
    if (!timestamp) return false;
    const date = new Date(timestamp as string | number);
    return date.getTime() < Date.now();
  },

  isFuture: (args) => {
    const [timestamp] = args;
    if (!timestamp) return false;
    const date = new Date(timestamp as string | number);
    return date.getTime() > Date.now();
  },

  isToday: (args) => {
    const [timestamp] = args;
    if (!timestamp) return false;
    const date = new Date(timestamp as string | number);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  },
};

/**
 * Resolve function arguments from Value[] to actual values
 */
export function resolveFunctionArgs(args: Value[], scope: Scope): unknown[] {
  return args.map((arg) => resolveValue(arg, scope));
}
