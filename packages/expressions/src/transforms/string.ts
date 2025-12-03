import type { TransformFn } from "../types";

export const stringTransforms: Record<string, TransformFn> = {
  uppercase: (value) => String(value).toUpperCase(),

  lowercase: (value) => String(value).toLowerCase(),

  capitalize: (value) => {
    const str = String(value);
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  titlecase: (value) => {
    return String(value)
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  },

  trim: (value) => String(value).trim(),

  truncate: (value, args) => {
    const str = String(value);
    const maxLen = Number(args[0]) || 100;
    const ellipsis = String(args[1] ?? "…");
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - ellipsis.length) + ellipsis;
  },

  replace: (value, args) => {
    const str = String(value);
    const search = String(args[0] ?? "");
    const replacement = String(args[1] ?? "");
    return str.split(search).join(replacement);
  },

  split: (value, args) => {
    const str = String(value);
    const separator = String(args[0] ?? ",");
    return str.split(separator);
  },

  slice: (value, args) => {
    const str = String(value);
    const start = Number(args[0]) || 0;
    const end = args[1] !== undefined ? Number(args[1]) : undefined;
    return str.slice(start, end);
  },

  padStart: (value, args) => {
    const str = String(value);
    const length = Number(args[0]) || 0;
    const char = String(args[1] ?? " ");
    return str.padStart(length, char);
  },

  padEnd: (value, args) => {
    const str = String(value);
    const length = Number(args[0]) || 0;
    const char = String(args[1] ?? " ");
    return str.padEnd(length, char);
  },

  concat: (value, args) => {
    // For arrays, concatenate arrays
    if (Array.isArray(value)) {
      const other = args[0];
      if (Array.isArray(other)) {
        return [...value, ...other];
      }
      return value;
    }
    // For strings, concatenate all args
    let result = String(value);
    for (const arg of args) {
      result += String(arg);
    }
    return result;
  },

  template: (value, args, scope) => {
    // Template string with {property} placeholders
    const template = String(args[0] ?? "");
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const ctx = scope.context as Record<string, unknown> | undefined;
      return String(ctx?.[key] ?? "");
    });
  },

  wrap: (value, args) => {
    const str = String(value);
    const before = String(args[0] ?? "");
    const after = String(args[1] ?? before);
    return before + str + after;
  },

  prefix: (value, args) => {
    return String(args[0] ?? "") + String(value);
  },

  suffix: (value, args) => {
    return String(value) + String(args[0] ?? "");
  },
};
