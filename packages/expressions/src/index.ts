// Types

// Compiler (AST, Lexer, Parser)
export type {
  ArgumentNode,
  CompiledTemplate,
  ExpressionAST,
  ExpressionNode,
  LiteralNode,
  PathNode,
  PipeNode,
  RefNode,
  SimplePathNode,
  TemplatePart,
  Token,
  TokenType,
  TransformNode,
  ValueNode,
} from "./compiler/index";
export {
  AST,
  compile,
  compileTemplate,
  compileToNode,
  isLiteralNode,
  isPathNode,
  isPipeNode,
  isRefNode,
  isSimplePathNode,
  isTransformNode,
  Lexer,
  Parser,
  tokenize,
} from "./compiler/index";
// Evaluator
export {
  createEvaluator,
  evaluate,
  evaluateCompiledTemplate,
  evaluateTemplate,
  registerTransforms,
} from "./evaluate";

// Template utilities
export { extractBindings, hasBindings } from "./template";
// Transforms
export {
  arrayTransforms,
  booleanTransforms,
  builtinTransforms,
  formatTransforms,
  numberTransforms,
  objectTransforms,
  predicateTransforms,
  stringTransforms,
} from "./transforms/index";
export type {
  EvaluatorOptions,
  Expression,
  PathExpression,
  Scope,
  Transform,
  TransformArg,
  TransformFn,
  TransformRegistry,
} from "./types";
// Utilities
export { getPath, isPathReference, resolveFromScope, setPath } from "./utils";
