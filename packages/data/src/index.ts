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
} from "./schema";

// Compiler exports
export {
  compileData,
  type CompiledData,
  type CompiledExpression,
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
