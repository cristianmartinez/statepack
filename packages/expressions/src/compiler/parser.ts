/**
 * Compiler for the expression engine
 *
 * Takes an expression string and produces a JSON AST representation
 * that can be serialized, validated, and evaluated.
 */

import { Lexer, type Token, type TokenType } from "./lexer";
import {
  type ExpressionAST,
  type ExpressionNode,
  type PathNode,
  type TransformNode,
  type ArgumentNode,
  type LiteralNode,
  type RefNode,
  AST,
} from "./ast";

export class Parser {
  private tokens: Token[] = [];
  private position = 0;
  private source: string;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Compile the expression string to an AST
   */
  compile(): ExpressionAST {
    // Tokenize
    const lexer = new Lexer(this.source);
    this.tokens = lexer.tokenize();
    this.position = 0;

    // Parse
    const ast = this.parseExpression();

    // Ensure we consumed all tokens
    if (!this.isAtEnd()) {
      throw new Error(
        `Unexpected token '${this.peek().value}' at position ${this.peek().position}`
      );
    }

    return AST.expression(this.source, ast);
  }

  private parseExpression(): ExpressionNode {
    // Parse the source path
    const source = this.parsePath();

    // Check for pipe transforms
    if (this.check("PIPE")) {
      const transforms = this.parseTransforms();
      return AST.pipe(source, transforms);
    }

    // Simple path without transforms
    return AST.simplePath(source);
  }

  private parsePath(): PathNode {
    const token = this.peek();

    // Path can be PATH or IDENTIFIER (single word paths like "index")
    if (token.type === "PATH" || token.type === "IDENTIFIER") {
      this.advance();
      return AST.path(token.value);
    }

    throw new Error(`Expected path at position ${token.position}, got ${token.type}`);
  }

  private parseTransforms(): TransformNode[] {
    const transforms: TransformNode[] = [];

    while (this.match("PIPE")) {
      transforms.push(this.parseTransform());
    }

    return transforms;
  }

  private parseTransform(): TransformNode {
    // Expect transform name (identifier)
    const nameToken = this.consume("IDENTIFIER", "Expected transform name after '|'");

    // Check for arguments
    const args: ArgumentNode[] = [];
    while (this.match("COLON")) {
      args.push(this.parseArgument());
    }

    return AST.transform(nameToken.value, args);
  }

  private parseArgument(): ArgumentNode {
    const token = this.peek();

    switch (token.type) {
      case "STRING":
        this.advance();
        return AST.literal(token.value);

      case "NUMBER":
        this.advance();
        return AST.literal(parseFloat(token.value));

      case "BOOLEAN":
        this.advance();
        return AST.literal(token.value === "true");

      case "NULL":
        this.advance();
        return AST.literal(null);

      case "REF":
        this.advance();
        return AST.ref(token.value);

      case "IDENTIFIER":
        // Could be a predicate expression like 'id == $event.itemId'
        // or just an unquoted string identifier
        this.advance();
        return AST.literal(token.value);

      case "PATH":
        // Path used as argument (unquoted property name like 'name')
        this.advance();
        return AST.literal(token.value);

      default:
        throw new Error(`Unexpected token '${token.value}' at position ${token.position}`);
    }
  }

  private peek(): Token {
    return this.tokens[this.position] ?? { type: "EOF", value: "", position: this.source.length };
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.position++;
    }
    return this.tokens[this.position - 1]!;
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new Error(`${message} at position ${this.peek().position}`);
  }
}

export function compile(expression: string): ExpressionAST {
  return new Parser(expression).compile();
}

export function compileToNode(expression: string): ExpressionNode {
  return compile(expression).ast;
}
