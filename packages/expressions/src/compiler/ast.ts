export interface LiteralNode {
  type: "literal";
  value: string | number | boolean | null;
}

export interface PathNode {
  type: "path";
  value: string;
  optional?: boolean;
}

export interface RefNode {
  type: "ref";
  path: string;
}

export type ValueNode = LiteralNode | PathNode | RefNode;

export interface TransformNode {
  type: "transform";
  name: string;
  args: ArgumentNode[];
}

export type ArgumentNode = LiteralNode | RefNode | ExpressionNode;

export interface PipeNode {
  type: "pipe";
  source: PathNode;
  transforms: TransformNode[];
}

export interface SimplePathNode {
  type: "simplePath";
  path: PathNode;
}

export type ExpressionNode = PipeNode | SimplePathNode;

export interface ExpressionAST {
  source: string;
  ast: ExpressionNode;
}

export function isLiteralNode(node: unknown): node is LiteralNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as LiteralNode).type === "literal"
  );
}

export function isPathNode(node: unknown): node is PathNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as PathNode).type === "path"
  );
}

export function isRefNode(node: unknown): node is RefNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as RefNode).type === "ref"
  );
}

export function isTransformNode(node: unknown): node is TransformNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as TransformNode).type === "transform"
  );
}

export function isPipeNode(node: unknown): node is PipeNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as PipeNode).type === "pipe"
  );
}

export function isSimplePathNode(node: unknown): node is SimplePathNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as SimplePathNode).type === "simplePath"
  );
}

export const AST = {
  literal: (value: string | number | boolean | null): LiteralNode => ({
    type: "literal",
    value,
  }),

  path: (value: string, optional = false): PathNode => ({
    type: "path",
    value,
    ...(optional && { optional }),
  }),

  ref: (path: string): RefNode => ({
    type: "ref",
    path,
  }),

  transform: (name: string, args: ArgumentNode[] = []): TransformNode => ({
    type: "transform",
    name,
    args,
  }),

  pipe: (source: PathNode, transforms: TransformNode[]): PipeNode => ({
    type: "pipe",
    source,
    transforms,
  }),

  simplePath: (path: PathNode): SimplePathNode => ({
    type: "simplePath",
    path,
  }),

  expression: (source: string, ast: ExpressionNode): ExpressionAST => ({
    source,
    ast,
  }),
};
