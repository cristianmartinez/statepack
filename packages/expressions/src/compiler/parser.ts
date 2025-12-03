/**
 * Compiler for the expression engine
 *
 * Takes an expression string and produces a JSON AST representation
 * that can be serialized, validated, and evaluated.
 */

import { BaseParser } from "@ouni/compiler";
import {
  type ArgumentNode,
  AST,
  type ExpressionAST,
  type ExpressionNode,
  type PathNode,
  type TransformNode,
} from "./ast";
import { Lexer, type TokenType } from "./lexer";

export class Parser extends BaseParser<TokenType, ExpressionNode, ExpressionAST> {
  constructor(source: string) {
    super(source);
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

    // Allow literals as source for utility transforms like '' | id
    if (token.type === "STRING" || token.type === "NUMBER" || token.type === "BOOLEAN" || token.type === "NULL") {
      this.advance();
      // Create a path with the literal value as a string
      return AST.path(String(token.value));
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

      case "LBRACE":
        return this.parseObject();

      case "LBRACKET":
        return this.parseArray();

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

  private parseObject(): ArgumentNode {
    this.consume("LBRACE", "Expected '{'");

    const properties: Record<string, ArgumentNode> = {};

    // Handle empty object
    if (this.check("RBRACE")) {
      this.advance();
      return AST.object(properties);
    }

    // Parse key-value pairs
    while (!this.check("RBRACE") && !this.isAtEnd()) {
      // Parse key (identifier or string)
      const keyToken = this.peek();
      let key: string;

      if (keyToken.type === "IDENTIFIER" || keyToken.type === "PATH") {
        key = keyToken.value;
        this.advance();
      } else if (keyToken.type === "STRING") {
        key = keyToken.value;
        this.advance();
      } else {
        throw new Error(`Expected property key at position ${keyToken.position}`);
      }

      // Expect colon
      this.consume("COLON", `Expected ':' after property key '${key}'`);

      // Parse value
      properties[key] = this.parseArgument();

      // Handle comma or end
      if (this.check("COMMA")) {
        this.advance();
      } else if (!this.check("RBRACE")) {
        throw new Error(`Expected ',' or '}' at position ${this.peek().position}`);
      }
    }

    this.consume("RBRACE", "Expected '}'");
    return AST.object(properties);
  }

  private parseArray(): ArgumentNode {
    this.consume("LBRACKET", "Expected '['");

    const elements: ArgumentNode[] = [];

    // Handle empty array
    if (this.check("RBRACKET")) {
      this.advance();
      return AST.array(elements);
    }

    // Parse elements
    while (!this.check("RBRACKET") && !this.isAtEnd()) {
      elements.push(this.parseArgument());

      // Handle comma or end
      if (this.check("COMMA")) {
        this.advance();
      } else if (!this.check("RBRACKET")) {
        throw new Error(`Expected ',' or ']' at position ${this.peek().position}`);
      }
    }

    this.consume("RBRACKET", "Expected ']'");
    return AST.array(elements);
  }
}

export function compile(expression: string): ExpressionAST {
  return new Parser(expression).compile();
}

export function compileToNode(expression: string): ExpressionNode {
  return compile(expression).ast;
}
