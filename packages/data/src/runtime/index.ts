import { evaluateCompiled } from "@ouni/expressions";
import type { CompiledData, CompiledExpression } from "../compiler";

/**
 * Runtime scope for evaluating expressions
 * @template TContext - The context state shape
 * @template TEvent - The event payload shape
 */
export interface RuntimeScope<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TEvent extends Record<string, unknown> = Record<string, unknown>,
> {
  context: TContext;
  event?: TEvent;
  [key: string]: unknown;
}

/**
 * Evaluate a query expression against the current context
 * @template TResult - The expected return type of the query
 * @template TContext - The context state shape
 */
export async function evaluateQuery<
  TResult = unknown,
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(
  compiled: CompiledData,
  queryName: string,
  scope: RuntimeScope<TContext>
): Promise<TResult> {
  const queryExpr = compiled.source.queries?.[queryName];
  if (!queryExpr) {
    throw new Error(`Query not found: ${queryName}`);
  }

  const expr = compiled.compiled.expressions.get(queryExpr);
  if (!expr) {
    throw new Error(`Compiled expression not found for query: ${queryName}`);
  }

  return evaluateCompiled(expr.compiled, scope) as Promise<TResult>;
}

/**
 * Execute a mutation and return the new context values
 * @template TResult - The expected shape of the mutation result (partial context update)
 * @template TContext - The context state shape
 * @template TEvent - The event payload shape
 */
export async function executeMutation<
  TResult extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TEvent extends Record<string, unknown> = Record<string, unknown>,
>(
  compiled: CompiledData,
  mutationName: string,
  scope: RuntimeScope<TContext, TEvent>
): Promise<TResult> {
  const mutation = compiled.source.mutations?.[mutationName];
  if (!mutation) {
    throw new Error(`Mutation not found: ${mutationName}`);
  }

  const results: Record<string, unknown> = {};

  for (const [contextKey, exprString] of Object.entries(mutation)) {
    const expr = compiled.compiled.expressions.get(exprString);
    if (!expr) {
      throw new Error(`Compiled expression not found for mutation ${mutationName}.${contextKey}`);
    }

    results[contextKey] = await evaluateCompiled(expr.compiled, scope);
  }

  return results as TResult;
}

/**
 * Get a compiled expression by its source string
 */
export function getExpression(
  compiled: CompiledData,
  source: string
): CompiledExpression | undefined {
  return compiled.compiled.expressions.get(source);
}
