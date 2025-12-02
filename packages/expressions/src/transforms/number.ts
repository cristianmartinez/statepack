import type { TransformFn } from "../types.ts";

export const numberTransforms: Record<string, TransformFn> = {
  number: (value) => {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  },

  round: (value, args) => {
    const num = Number(value);
    const decimals = Number(args[0] ?? 0);
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  },

  floor: (value) => Math.floor(Number(value)),

  ceil: (value) => Math.ceil(Number(value)),

  abs: (value) => Math.abs(Number(value)),

  clamp: (value, args) => {
    const num = Number(value);
    const min = Number(args[0] ?? -Infinity);
    const max = Number(args[1] ?? Infinity);
    return Math.min(Math.max(num, min), max);
  },

  percent: (value) => Number(value) * 100,

  add: (value, args) => Number(value) + Number(args[0] ?? 0),

  subtract: (value, args) => Number(value) - Number(args[0] ?? 0),

  multiply: (value, args) => Number(value) * Number(args[0] ?? 1),

  divide: (value, args) => {
    const divisor = Number(args[0] ?? 1);
    return divisor !== 0 ? Number(value) / divisor : 0;
  },

  mod: (value, args) => Number(value) % Number(args[0] ?? 1),

  pow: (value, args) => Math.pow(Number(value), Number(args[0] ?? 1)),

  sqrt: (value) => Math.sqrt(Number(value)),

  min: (value, args) => {
    if (Array.isArray(value)) {
      return Math.min(...value.map(Number));
    }
    return Math.min(Number(value), Number(args[0] ?? value));
  },

  max: (value, args) => {
    if (Array.isArray(value)) {
      return Math.max(...value.map(Number));
    }
    return Math.max(Number(value), Number(args[0] ?? value));
  },
};
