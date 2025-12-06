import { z } from "zod";

/**
 * Mutation definition - context modification operation
 *
 * Mutations define how context is modified. Each mutation specifies
 * which context keys to update and the expressions to compute new values.
 *
 * Similar to reducers in Redux or mutations in Vuex.
 *
 * @example
 * ```json
 * {
 *   "mutations": {
 *     "addTodo": {
 *       "todos": "$append(context.todos, { id: $uuid(), text: event.text, completed: false })"
 *     },
 *     "toggleTodo": {
 *       "todos": "$map(context.todos, function($t) { $t.id = event.id ? $merge([$t, { completed: $not($t.completed) }]) : $t })"
 *     },
 *     "deleteTodo": {
 *       "todos": "context.todos[id != event.id]"
 *     },
 *     "setFilter": {
 *       "filter": "event.filter"
 *     },
 *     "clearCompleted": {
 *       "todos": "context.todos[completed = false]"
 *     }
 *   }
 * }
 * ```
 */
export const MutationSchema = z.record(z.string(), z.string());
export type Mutation = z.infer<typeof MutationSchema>;

/**
 * Mutations map - keyed by mutation name
 * Each mutation is a record of context keys to expression values
 */
export const MutationsSchema = z.record(z.string(), MutationSchema);
export type Mutations = z.infer<typeof MutationsSchema>;
