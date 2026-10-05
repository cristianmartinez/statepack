import type { BuiltinFn, ExprValue } from "@cristianmartinez/yexp";
import { assertPortableJson } from "./artifact";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ExpressionFunction = (arguments_: readonly JsonValue[]) => JsonValue;

export class ExpressionFunctionError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Host-owned functions. Functions are runtime capabilities, never saved in JSON. */
export class ExpressionFunctionRegistry {
  private readonly functions = new Map<string, ExpressionFunction>();

  register(name: string, fn: ExpressionFunction): this {
    if (!name) throw new Error("Expression function names cannot be empty");
    this.functions.set(name, fn);
    return this;
  }

  has(name: string): boolean { return this.functions.has(name); }
  names(): string[] { return [...this.functions.keys()]; }

  call(name: string, arguments_: readonly JsonValue[]): JsonValue {
    const fn = this.functions.get(name);
    if (!fn) throw new ExpressionFunctionError("UNKNOWN_FUNCTION", `Unknown function: ${name}`);
    assertPortableJson(arguments_);
    const result = fn(JSON.parse(JSON.stringify(arguments_)) as JsonValue[]);
    assertPortableJson(result);
    return JSON.parse(JSON.stringify(result)) as JsonValue;
  }

  /** Bridge the explicit JSON registry contract to the upstream variadic VM API. */
  toYexpFunctions(): Record<string, BuiltinFn> {
    return Object.fromEntries(this.names().map(name => [name, (...args: ExprValue[]) => this.call(name, args as JsonValue[]) as ExprValue]));
  }
}

function number(value: JsonValue | undefined): number {
  if (typeof value !== "number") throw new ExpressionFunctionError("TYPE_ERROR", "Expected a number");
  return value;
}

function toString(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.map(item => item === null ? "" : toString(item)).join(",");
  if (typeof value === "object") return "[object Object]";
  return String(value);
}

/** Deterministic primitive names shared by the native execution profile. */
export function createPrimitiveRegistry(): ExpressionFunctionRegistry {
  const registry = new ExpressionFunctionRegistry();
  function builtin(name: string, min: number, max: number, fn: ExpressionFunction): ExpressionFunctionRegistry {
    registry.register(name, args => {
      if (args.length < min || args.length > max) throw new ExpressionFunctionError("TYPE_ERROR", `Invalid arity for ${name}`);
      return fn(args);
    });
    return registry;
  }
  // Wrap each standard function so its signature matches every native registry.
  builtin("length", 1, 1, ([value]) => {
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    throw new ExpressionFunctionError("TYPE_ERROR", "length requires a string or array");
  });
  builtin("abs",1,1,([value]) => Math.abs(number(value)));
  builtin("floor",1,1,([value]) => Math.floor(number(value)));
  builtin("ceil",1,1,([value]) => Math.ceil(number(value)));
  builtin("round",1,2,([value, decimals]) => {
    const factor = 10 ** (decimals === undefined ? 0 : number(decimals));
    return Math.round(number(value) * factor) / factor;
  });
  builtin("min",1,Infinity,args => Math.min(...args.map(number)));
  builtin("max",1,Infinity,args => Math.max(...args.map(number)));
  builtin("toString",1,1,([value]) => toString(value!));
  return registry;
}
