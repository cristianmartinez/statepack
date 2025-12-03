import {
  type ArgumentNode,
  compile,
  type CompiledTemplate,
  type ExpressionNode,
  isLiteralNode,
  isPipeNode,
  isRefNode,
  isSimplePathNode,
} from "./compiler/index";
import { extractBindings, hasBindings } from "./template";
import { builtinTransforms } from "./transforms/index";
import type {
  EvaluatorOptions,
  Expression,
  PathExpression,
  Scope,
  TransformRegistry,
} from "./types";
import { resolveFromScope } from "./utils";

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
    typeof expression === "string" ? compile(expression).ast : pathExpressionToAST(expression);

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
 * Evaluate a pre-compiled template with AST nodes
 */
export function evaluateCompiledTemplate(
  compiled: CompiledTemplate,
  scope: Scope,
  options: EvaluatorOptions = {}
): string {
  let result = "";

  for (const part of compiled.parts) {
    if (part.type === "static") {
      result += part.value as string;
    } else {
      // part.type === "expression", part.value is ExpressionNode
      const ast = part.value as ExpressionNode;
      const value = evaluateAST(ast, scope, options);
      result += String(value ?? "");
    }
  }

  return result;
}

/**
 * Evaluate an AST node directly (internal helper)
 */
function evaluateAST(ast: ExpressionNode, scope: Scope, options: EvaluatorOptions = {}): unknown {
  const transforms = options.transforms
    ? { ...builtinTransforms, ...options.transforms }
    : builtinTransforms;

  if (isSimplePathNode(ast)) {
    return resolveFromScope(ast.path.value, scope);
  }

  if (isPipeNode(ast)) {
    let value = resolveFromScope(ast.source.value, scope);

    for (const transform of ast.transforms) {
      const transformFn = transforms[transform.name];
      if (!transformFn) {
        throw new Error(`Unknown transform: ${transform.name}`);
      }

      const args = transform.args.map((arg) => resolveArg(arg, scope));
      value = transformFn(value, args, scope);
    }

    return value;
  }

  throw new Error("Unknown AST node type");
}

/**
 * Create an evaluator with preset options
 */
export function createEvaluator(options: EvaluatorOptions = {}) {
  return {
    evaluate: (expression: Expression, scope: Scope) => evaluate(expression, scope, options),
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
    const path = arg.path;
    if (path.includes("|")) {
      return evaluate(path, scope);
    }
    return resolveFromScope(path, scope);
  }

  // ExpressionNode (PipeNode or SimplePathNode)
  if (isSimplePathNode(arg)) {
    return resolveFromScope(arg.path.value, scope);
  }

  if (isPipeNode(arg)) {
    let value = resolveFromScope(arg.source.value, scope);
    for (const transform of arg.transforms) {
      const transformFn = builtinTransforms[transform.name];
      if (!transformFn) {
        throw new Error(`Unknown transform: ${transform.name}`);
      }
      const args = transform.args.map((a) => resolveArg(a, scope));
      value = transformFn(value, args, scope);
    }
    return value;
  }

  return undefined;
}

/**
 * Register custom transforms
 */
export function registerTransforms(transforms: TransformRegistry): TransformRegistry {
  return { ...builtinTransforms, ...transforms };
}
