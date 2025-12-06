import { z } from "zod";
import { ContextSchema } from "./context";
import { MutationsSchema } from "./mutation";
import { QueriesSchema } from "./query";
import { SourcesSchema } from "./source";

/**
 * Slice Definition (JSON-serializable)
 * A named data instance within a store with context, queries, mutations
 */
export const SliceDefinitionSchema = z.object({
  /** Initial context state */
  context: ContextSchema.optional(),
  /** Derived state (JSONata expressions over context) */
  queries: QueriesSchema.optional(),
  /** Context modifications */
  mutations: MutationsSchema.optional(),
  /** API sources */
  sources: SourcesSchema.optional(),
});

export type SliceDefinition = z.infer<typeof SliceDefinitionSchema>;

/**
 * Store Definition (JSON-serializable)
 * A collection of named slices - the serializable schema
 */
export const StoreDefinitionSchema = z.record(z.string(), SliceDefinitionSchema);

export type StoreDefinition = z.infer<typeof StoreDefinitionSchema>;

// Legacy aliases for backward compatibility
export const SliceSchema = SliceDefinitionSchema;
export type Slice = SliceDefinition;
export const StoreSchema = StoreDefinitionSchema;
export type Store = StoreDefinition;
