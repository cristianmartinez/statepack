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
} from "./types";

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
} from "./compiler/index";

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
} from "./compiler/index";

// Template utilities
export { extractBindings, hasBindings } from "./template";

// Evaluator
export { evaluate, evaluateTemplate, createEvaluator, registerTransforms } from "./evaluate";

// Utilities
export { getPath, setPath, isPathReference, resolveFromScope } from "./utils";

// Transforms
export { builtinTransforms } from "./transforms/index";
export {
  stringTransforms,
  numberTransforms,
  formatTransforms,
  arrayTransforms,
  objectTransforms,
  booleanTransforms,
  predicateTransforms,
} from "./transforms/index";
