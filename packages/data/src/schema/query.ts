import { z } from "zod";

/**
 * Query definition - derived state from context
 *
 * Queries are reactive computations over context. They can:
 * - Select/transform context data
 * - Filter, map, aggregate collections
 * - Combine multiple context values
 *
 * Similar to selectors in Redux or computed properties in Vue.
 *
 * @example
 * ```json
 * {
 *   "queries": {
 *     "completedTodos": "context.todos[completed = true]",
 *     "pendingTodos": "context.todos[completed = false]",
 *     "todoCount": "$count(context.todos)",
 *     "hasCompletedTodos": "$count(context.todos[completed = true]) > 0",
 *     "searchResults": "context.items[$contains(name, context.searchQuery)]"
 *   }
 * }
 * ```
 */
export const QuerySchema = z.string();
export type Query = z.infer<typeof QuerySchema>;

/**
 * Queries map - keyed by query name
 * Each value is a JSONata expression evaluated against context
 */
export const QueriesSchema = z.record(z.string(), QuerySchema);
export type Queries = z.infer<typeof QueriesSchema>;
