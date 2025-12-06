import { z } from "zod";

/**
 * HTTP methods supported by sources
 */
export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/**
 * Response type for parsing
 */
export const ResponseTypeSchema = z.enum(["json", "text", "blob"]);
export type ResponseType = z.infer<typeof ResponseTypeSchema>;

/**
 * Pagination strategy
 */
export const PaginationTypeSchema = z.enum(["offset", "cursor"]);
export type PaginationType = z.infer<typeof PaginationTypeSchema>;

export const PaginationSchema = z.object({
  type: PaginationTypeSchema,
  pageSize: z.number().optional(),
  cursorPath: z.string().optional(), // For cursor-based: path to next cursor in response
  hasMorePath: z.string().optional(), // For cursor-based: path to hasMore flag
});
export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Source definition - declarative API endpoint
 *
 * @example
 * ```json
 * {
 *   "url": "/api/todos/{id}",
 *   "method": "GET",
 *   "headers": { "Accept": "application/json" }
 * }
 * ```
 */
export const SourceSchema = z.object({
  /** URL template with optional path parameters like {id} */
  url: z.string(),
  /** HTTP method (default: GET) */
  method: HttpMethodSchema.optional(),
  /** Static headers */
  headers: z.record(z.string()).optional(),
  /** Response parsing type (default: json) */
  responseType: ResponseTypeSchema.optional(),
  /** Pagination configuration */
  pagination: PaginationSchema.optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Sources map - keyed by source name
 */
export const SourcesSchema = z.record(z.string(), SourceSchema);
export type Sources = z.infer<typeof SourcesSchema>;
