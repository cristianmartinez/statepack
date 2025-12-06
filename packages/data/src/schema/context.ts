import { z } from "zod";

/**
 * Context value types
 */
export const ContextValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(ContextValueSchema),
    z.record(z.string(), ContextValueSchema),
  ])
);
export type ContextValue = z.infer<typeof ContextValueSchema>;

/**
 * Context definition - initial state values
 *
 * Context is the local state container. Values can be:
 * - Static values (strings, numbers, booleans, arrays, objects)
 *
 * @example
 * ```json
 * {
 *   "context": {
 *     "count": 0,
 *     "searchQuery": "",
 *     "todos": [],
 *     "filter": "all"
 *   }
 * }
 * ```
 */
export const ContextSchema = z.record(z.string(), ContextValueSchema);
export type Context = z.infer<typeof ContextSchema>;
