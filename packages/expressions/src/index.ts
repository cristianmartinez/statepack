// Types
export type {
  Expression,
  PathExpression,
  Transform,
  TransformArg,
  Scope,
  EvaluatorOptions,
  TransformFn,
  TransformRegistry,
} from "./types.ts";

// Compiler (AST, Lexer, Parser)
export type {
  ExpressionAST,
  ExpressionNode,
  PipeNode,
  SimplePathNode,
  PathNode,
  TransformNode,
  ArgumentNode,
  LiteralNode,
  RefNode,
  ValueNode,
  Token,
  TokenType,
} from "./compiler/index.ts";

export {
  AST,
  isLiteralNode,
  isPathNode,
  isRefNode,
  isTransformNode,
  isPipeNode,
  isSimplePathNode,
  Lexer,
  tokenize,
  Parser,
  compile,
  compileToNode,
} from "./compiler/index.ts";

// Template utilities
export { extractBindings, hasBindings } from "./template.ts";

// Evaluator
export {
  evaluate,
  evaluateTemplate,
  createEvaluator,
  registerTransforms,
} from "./evaluate.ts";

// Utilities
export { getPath, setPath, isPathReference, resolveFromScope } from "./utils.ts";

// Transforms
export { builtinTransforms } from "./transforms/index.ts";
export {
  stringTransforms,
  numberTransforms,
  formatTransforms,
  arrayTransforms,
  objectTransforms,
  booleanTransforms,
  predicateTransforms,
} from "./transforms/index.ts";
