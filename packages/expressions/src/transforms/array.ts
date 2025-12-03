import type { TransformFn } from "../types";
import { getPath } from "../utils";

export const arrayTransforms: Record<string, TransformFn> = {
  length: (value) => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "string") return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return 0;
  },

  first: (value) => {
    if (Array.isArray(value)) return value[0];
    return undefined;
  },

  last: (value) => {
    if (Array.isArray(value)) return value[value.length - 1];
    return undefined;
  },

  at: (value, args) => {
    if (!Array.isArray(value)) return undefined;
    const index = Number(args[0] ?? 0);
    // Support negative indices
    return index < 0 ? value[value.length + index] : value[index];
  },

  reverse: (value) => {
    if (!Array.isArray(value)) return value;
    return [...value].reverse();
  },

  sort: (value, args) => {
    if (!Array.isArray(value)) return value;
    const order = String(args[0] ?? "asc");
    return [...value].sort((a, b) => {
      const cmp = a < b ? -1 : a > b ? 1 : 0;
      return order === "desc" ? -cmp : cmp;
    });
  },

  sortBy: (value, args) => {
    if (!Array.isArray(value)) return value;
    const prop = String(args[0] ?? "");
    const order = String(args[1] ?? "asc");
    return [...value].sort((a, b) => {
      const aVal = getPath(a, prop) as string | number;
      const bVal = getPath(b, prop) as string | number;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return order === "desc" ? -cmp : cmp;
    });
  },

  filter: (value, args) => {
    if (!Array.isArray(value)) return value;

    const prop = String(args[0] ?? "");
    const filterVal = args[1];

    return value.filter((item) => {
      const itemVal = getPath(item, prop);
      return filterVal !== undefined ? itemVal === filterVal : !!itemVal;
    });
  },

  reject: (value, args) => {
    if (!Array.isArray(value)) return value;
    const prop = String(args[0] ?? "");
    const rejectVal = args[1];

    // If rejectVal provided, filter out items where prop === rejectVal
    if (rejectVal !== undefined) {
      return value.filter((item) => {
        const itemVal = getPath(item, prop);
        return itemVal !== rejectVal;
      });
    }

    // Otherwise filter out truthy values (legacy behavior)
    return value.filter((item) => !getPath(item, prop));
  },

  map: (value, args) => {
    if (!Array.isArray(value)) return value;

    // map: 'id', matchId, 'completed', 'toggle' - update specific item's property
    if (args.length === 4) {
      const matchProp = String(args[0]);
      const matchVal = args[1];
      const updateProp = String(args[2]);
      const updateVal = args[3];

      return value.map((item) => {
        const itemVal = getPath(item, matchProp);
        if (itemVal === matchVal) {
          // Special case: 'toggle' means flip boolean
          if (updateVal === "toggle") {
            const currentVal = getPath(item, updateProp);
            return { ...item, [updateProp]: !currentVal };
          }
          return { ...item, [updateProp]: updateVal };
        }
        return item;
      });
    }

    // map: 'propName' - extract property (legacy behavior)
    const prop = String(args[0] ?? "");
    return value.map((item) => getPath(item, prop));
  },

  unique: (value) => {
    if (!Array.isArray(value)) return value;
    return [...new Set(value)];
  },

  uniqueBy: (value, args) => {
    if (!Array.isArray(value)) return value;
    const prop = String(args[0] ?? "");
    const seen = new Set();
    return value.filter((item) => {
      const key = getPath(item, prop);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  flatten: (value, args) => {
    if (!Array.isArray(value)) return value;
    const depth = Number(args[0] ?? 1);
    return value.flat(depth);
  },

  take: (value, args) => {
    if (!Array.isArray(value)) return value;
    const n = Number(args[0] ?? 1);
    return value.slice(0, n);
  },

  skip: (value, args) => {
    if (!Array.isArray(value)) return value;
    const n = Number(args[0] ?? 1);
    return value.slice(n);
  },

  slice: (value, args) => {
    if (!Array.isArray(value) && typeof value !== "string") return value;
    const start = Number(args[0] ?? 0);
    const end = args[1] !== undefined ? Number(args[1]) : undefined;
    return (value as unknown[]).slice(start, end);
  },

  join: (value, args) => {
    if (!Array.isArray(value)) return String(value);
    const separator = String(args[0] ?? ",");
    return value.join(separator);
  },

  groupBy: (value, args) => {
    if (!Array.isArray(value)) return value;
    const prop = String(args[0] ?? "");
    const groups: Record<string, unknown[]> = {};

    for (const item of value) {
      const key = String(getPath(item, prop) ?? "undefined");
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return groups;
  },

  find: (value, args) => {
    if (!Array.isArray(value)) return undefined;
    const prop = String(args[0] ?? "");
    const findVal = args[1];

    return value.find((item) => {
      const itemVal = getPath(item, prop);
      return findVal !== undefined ? itemVal === findVal : !!itemVal;
    });
  },

  includes: (value, args) => {
    if (Array.isArray(value)) return value.includes(args[0]);
    if (typeof value === "string") return value.includes(String(args[0] ?? ""));
    return false;
  },

  sum: (value, args) => {
    if (!Array.isArray(value)) return Number(value);
    const prop = args[0] ? String(args[0]) : null;

    return value.reduce((acc, item) => {
      const val = prop ? getPath(item, prop) : item;
      return acc + (Number(val) || 0);
    }, 0);
  },

  avg: (value, args) => {
    if (!Array.isArray(value) || value.length === 0) return 0;
    const prop = args[0] ? String(args[0]) : null;

    const sum = value.reduce((acc, item) => {
      const val = prop ? getPath(item, prop) : item;
      return acc + (Number(val) || 0);
    }, 0);

    return sum / value.length;
  },

  count: (value, args) => {
    if (!Array.isArray(value)) return 0;
    if (args[0] === undefined) return value.length;

    const prop = String(args[0]);
    return value.filter((item) => !!getPath(item, prop)).length;
  },

  // Mutation transforms
  append: (value, args) => {
    if (!Array.isArray(value)) return [value, args[0]];
    return [...value, args[0]];
  },

  prepend: (value, args) => {
    if (!Array.isArray(value)) return [args[0], value];
    return [args[0], ...value];
  },

  insert: (value, args) => {
    if (!Array.isArray(value)) return value;
    const index = Number(args[0] ?? 0);
    const item = args[1];
    const result = [...value];
    result.splice(index, 0, item);
    return result;
  },

  removeAt: (value, args) => {
    if (!Array.isArray(value)) return value;
    const index = Number(args[0] ?? 0);
    return value.filter((_, i) => i !== index);
  },
};
