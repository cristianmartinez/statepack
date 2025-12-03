import type { TransformFn } from "../types";
import { getPath, setPath } from "../utils";

export const objectTransforms: Record<string, TransformFn> = {
  keys: (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value);
    }
    return [];
  },

  values: (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.values(value);
    }
    return [];
  },

  entries: (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value);
    }
    return [];
  },

  pick: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const keysStr = String(args[0] ?? "");
    const keys = keysStr.split(",").map((k) => k.trim());
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      if (key in (value as Record<string, unknown>)) {
        result[key] = (value as Record<string, unknown>)[key];
      }
    }

    return result;
  },

  omit: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const keysStr = String(args[0] ?? "");
    const keys = new Set(keysStr.split(",").map((k) => k.trim()));
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!keys.has(k)) {
        result[k] = v;
      }
    }

    return result;
  },

  get: (value, args) => {
    const path = String(args[0] ?? "");
    return getPath(value, path);
  },

  set: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const key = String(args[0] ?? "");
    const newValue = args[1];

    return { ...(value as Record<string, unknown>), [key]: newValue };
  },

  setPath: (value, args) => {
    const path = String(args[0] ?? "");
    const newValue = args[1];
    return setPath(value, path, newValue);
  },

  unset: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const key = String(args[0] ?? "");
    const result = { ...(value as Record<string, unknown>) };
    delete result[key];
    return result;
  },

  merge: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return args[0] ?? value;
    }

    const other = args[0];
    if (!other || typeof other !== "object" || Array.isArray(other)) {
      return value;
    }

    return { ...(value as Record<string, unknown>), ...(other as Record<string, unknown>) };
  },

  mergeDeep: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return args[0] ?? value;
    }

    const other = args[0];
    if (!other || typeof other !== "object" || Array.isArray(other)) {
      return value;
    }

    return deepMerge(
      value as Record<string, unknown>,
      other as Record<string, unknown>
    );
  },

  toggle: (value, args) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const key = String(args[0] ?? "");
    const obj = value as Record<string, unknown>;

    return { ...obj, [key]: !obj[key] };
  },
};

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (
      targetVal &&
      sourceVal &&
      typeof targetVal === "object" &&
      typeof sourceVal === "object" &&
      !Array.isArray(targetVal) &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}
