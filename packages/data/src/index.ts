/**
 * @ouni/data
 *
 * Data layer schema and compiler for mini-apps.
 * Defines context, queries (derived state), and mutations (state changes).
 */

// Schema exports
export {
  // Context types (initial state)
  ContextValueSchema,
  type ContextValue,
  ContextSchema,
  type Context,
  // Query types (derived state from context)
  QuerySchema,
  type Query,
  QueriesSchema,
  type Queries,
  // Mutation types (context modifications)
  MutationSchema,
  type Mutation,
  MutationsSchema,
  type Mutations,
  // Source types (for future API integration)
  HttpMethodSchema,
  type HttpMethod,
  ResponseTypeSchema,
  type ResponseType,
  PaginationTypeSchema,
  type PaginationType,
  PaginationSchema,
  type Pagination,
  SourceSchema,
  type Source,
  SourcesSchema,
  type Sources,
  // Store types (multi-slice composition)
  SliceDefinitionSchema,
  type SliceDefinition,
  StoreDefinitionSchema,
  type StoreDefinition,
  SliceSchema,
  type Slice,
  StoreSchema,
  type Store,
} from "./schema";

// Compiler exports
export {
  compileData,
  type CompiledData,
  type CompiledExpression as CompiledDataExpression,
  type DataDefinition,
  isCompiledData,
} from "./compiler";

// Runtime exports
export {
  evaluateQuery,
  executeMutation,
  getExpression,
  type RuntimeScope,
} from "./runtime";

// Store exports (multi-slice data composition)
export {
  // Compiler
  compileStore,
  type CompiledStore,
  type CompiledSlice,
  type CompiledExpression,
  // Signal Runtime (reactive)
  createSignalStoreInstance,
  getSignalContextSnapshot,
  getSignalStoreSnapshot,
  updateSignalContext,
  buildSignalScope,
  buildPlainScope,
  executeSignalMutation,
  getSignalQueryValue,
  getSignalQueryBinding,
  disposeSignalStore,
  type SignalStoreInstance,
  type SignalContext,
} from "./store";
