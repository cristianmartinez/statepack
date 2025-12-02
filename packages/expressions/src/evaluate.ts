import type {
  Expression,
  PathExpression,
  Scope,
  EvaluatorOptions,
  TransformRegistry,
} from "./types.ts";
import {
  compile,
  type ExpressionNode,
  type ArgumentNode,
  isPipeNode,
  isSimplePathNode,
  isLiteralNode,
  isRefNode,
} from "./compiler/index.ts";
import { extractBindings, hasBindings } from "./template.ts";
import { builtinTransforms } from "./transforms/index.ts";
import { resolveFromScope } from "./utils.ts";

/**
 * Evaluate an expression against a scope
 */
export function evaluate(
  expression: Expression,
  scope: Scope,
  options: EvaluatorOptions = {}
): unknown {
  // Compile string expression to AST, or convert PathExpression to AST
  const ast: ExpressionNode =
    typeof expression === "string"
      ? compile(expression).ast
      : pathExpressionToAST(expression);

  // Get transforms registry
  const transforms = options.transforms
    ? { ...builtinTransforms, ...options.transforms }
    : builtinTransforms;

  // Evaluate based on AST type
  if (isSimplePathNode(ast)) {
    return resolveFromScope(ast.path.value, scope);
  }

  if (isPipeNode(ast)) {
    // Get base value from source path
    let value = resolveFromScope(ast.source.value, scope);

    // Apply transforms
    for (const transform of ast.transforms) {
      const transformFn = transforms[transform.name];
      if (!transformFn) {
        throw new Error(`Unknown transform: ${transform.name}`);
      }

      // Resolve arguments
      const args = transform.args.map((arg) => resolveArg(arg, scope));

      // Apply transform
      value = transformFn(value, args, scope);
    }

    return value;
  }

  throw new Error("Unknown AST node type");
}

/**
 * Evaluate a template string with bindings like "Hello, {{name}}!"
 */
export function evaluateTemplate(
  template: string,
  scope: Scope,
  options: EvaluatorOptions = {}
): string {
  if (!hasBindings(template)) {
    return template;
  }

  const { parts, expressions } = extractBindings(template);

  let result = parts[0] ?? "";

  for (let i = 0; i < expressions.length; i++) {
    const expr = expressions[i]!;
    const value = evaluate(expr, scope, options);
    result += String(value ?? "");
    result += parts[i + 1] ?? "";
  }

  return result;
}

/**
 * Create an evaluator with preset options
 */
export function createEvaluator(options: EvaluatorOptions = {}) {
  return {
    evaluate: (expression: Expression, scope: Scope) =>
      evaluate(expression, scope, options),
    evaluateTemplate: (template: string, scope: Scope) =>
      evaluateTemplate(template, scope, options),
  };
}

/**
 * Convert a PathExpression object to AST
 */
function pathExpressionToAST(expr: PathExpression): ExpressionNode {
  const path = { type: "path" as const, value: expr.path };

  if (!expr.transforms || expr.transforms.length === 0) {
    return { type: "simplePath", path };
  }

  return {
    type: "pipe",
    source: path,
    transforms: expr.transforms.map((t) => ({
      type: "transform" as const,
      name: t.name,
      args: (t.args ?? []).map((arg): ArgumentNode => {
        if (typeof arg === "object" && arg !== null && "path" in arg) {
          return { type: "ref", path: arg.path };
        }
        return { type: "literal", value: arg as string | number | boolean | null };
      }),
    })),
  };
}

/**
 * Resolve an argument to its actual value
 */
function resolveArg(arg: ArgumentNode, scope: Scope): unknown {
  if (isLiteralNode(arg)) {
    return arg.value;
  }

  if (isRefNode(arg)) {
    // Path references - resolve from scope
    const path = arg.path;

    // Check if it's a nested expression (contains pipes)
    if (path.includes("|")) {
      return evaluate(path, scope);
    }

    return resolveFromScope(path, scope);
  }

  // Nested expression node - evaluate it
  return evaluate(arg as unknown as string, scope);
}

/**
 * Register custom transforms
 */
export function registerTransforms(
  transforms: TransformRegistry
): TransformRegistry {
  return { ...builtinTransforms, ...transforms };
}
