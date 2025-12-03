import type { TransformFn } from "../types";

export const booleanTransforms: Record<string, TransformFn> = {
  default: (value, args) => {
    return value ?? args[0];
  },

  bool: (value) => {
    return !!value;
  },

  not: (value) => {
    return !value;
  },

  exists: (value) => {
    return value !== null && value !== undefined;
  },

  empty: (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  },

  eq: (value, args) => {
    return value === args[0];
  },

  ne: (value, args) => {
    return value !== args[0];
  },

  gt: (value, args) => {
    return Number(value) > Number(args[0]);
  },

  gte: (value, args) => {
    return Number(value) >= Number(args[0]);
  },

  lt: (value, args) => {
    return Number(value) < Number(args[0]);
  },

  lte: (value, args) => {
    return Number(value) <= Number(args[0]);
  },

  if: (value, args) => {
    const [condition, thenVal, elseVal] = args;

    // If condition is `true`, check truthiness of value
    // Otherwise check equality with condition
    const matches =
      condition === true ? !!value : value === condition;

    return matches ? thenVal : elseVal;
  },

  when: (value, args) => {
    const [matchVal, result] = args;
    return value === matchVal ? result : value;
  },

  switch: (value, args) => {
    // Args come as pairs: value, result, value, result, ...
    for (let i = 0; i < args.length - 1; i += 2) {
      if (value === args[i]) {
        return args[i + 1];
      }
    }
    // Return original value if no match
    return value;
  },
};
