/**
 * Parser for condition expressions
 * Builds AST from tokens with proper operator precedence
 *
 * Operator precedence (lowest to highest):
 * 1. || (OR)
 * 2. && (AND)
 * 3. ! (NOT)
 * 4. Comparisons (===, !==, >, <, etc.)
 * 5. Function calls, parentheses
 */

import type { CompareOp, Condition, Value } from "../types";
import { AST, type CompiledCondition } from "./ast";
import { Lexer, type Token, type TokenType } from "./lexer";

export class Parser {
  private tokens: Token[] = [];
  private position = 0;
  private source: string;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Compile the condition string to an AST
   */
  compile(): CompiledCondition {
    // Tokenize
    const lexer = new Lexer(this.source);
    this.tokens = lexer.tokenize();
    this.position = 0;

    // Parse
    const ast = this.parseOr();

    // Ensure we consumed all tokens
    if (!this.isAtEnd()) {
      throw new Error(
        `Unexpected token '${this.peek().value}' at position ${this.peek().position}`
      );
    }

    return AST.compiled(this.source, ast);
  }

  /**
   * Parse OR expressions (lowest precedence)
   * expr || expr || ...
   */
  private parseOr(): Condition {
    const conditions: Condition[] = [this.parseAnd()];

    while (this.match("OPERATOR", "||")) {
      conditions.push(this.parseAnd());
    }

    // If we only have one condition, return it directly
    if (conditions.length === 1) {
      return conditions[0]!;
    }

    return AST.or(conditions);
  }

  /**
   * Parse AND expressions (higher precedence than OR)
   * expr && expr && ...
   */
  private parseAnd(): Condition {
    const conditions: Condition[] = [this.parseNot()];

    while (this.match("OPERATOR", "&&")) {
      conditions.push(this.parseNot());
    }

    // If we only have one condition, return it directly
    if (conditions.length === 1) {
      return conditions[0]!;
    }

    return AST.and(conditions);
  }

  /**
   * Parse NOT expressions (higher precedence than AND)
   * !expr
   */
  private parseNot(): Condition {
    if (this.match("OPERATOR", "!")) {
      return AST.not(this.parseNot()); // Right-associative
    }

    return this.parseComparison();
  }

  /**
   * Parse comparison expressions (higher precedence than NOT)
   * expr > expr, expr === expr, etc.
   */
  private parseComparison(): Condition {
    const left = this.parsePrimary();

    // Check for comparison operators
    const comparisonOps: CompareOp[] = ["===", "!==", "==", "!=", ">=", "<=", ">", "<"];
    const currentToken = this.peek();

    if (
      currentToken.type === "OPERATOR" &&
      comparisonOps.includes(currentToken.value as CompareOp)
    ) {
      const op = currentToken.value as CompareOp;
      this.advance();

      const right = this.parsePrimary();

      // Convert to Value types
      const leftValue = this.toValue(left);
      const rightValue = this.toValue(right);

      return AST.compare(op, leftValue, rightValue);
    }

    // If no comparison, left should be a Condition (truthy check or complex condition)
    return this.toCondition(left);
  }

  /**
   * Convert result from parsePrimary to a Value
   */
  private toValue(result: Condition | Value | string): Value {
    if (typeof result === "string") {
      return AST.ref(result);
    }
    if (typeof result === "number" || typeof result === "boolean" || result === null) {
      return AST.literal(result);
    }
    if (typeof result === "object" && "type" in result) {
      // Already a structured type - check if it's a Value
      if (result.type === "literal" || result.type === "ref") {
        return result as Value;
      }
    }
    throw new Error("Cannot convert complex condition to value in comparison");
  }

  /**
   * Convert result from parsePrimary to a Condition
   */
  private toCondition(result: Condition | Value | string): Condition {
    if (typeof result === "string") {
      return result; // Truthy check
    }
    if (typeof result === "boolean") {
      return result; // Boolean literal condition
    }
    return result as Condition;
  }

  /**
   * Parse primary expressions (highest precedence)
   * - Parentheses
   * - Function calls
   * - Values (literals, paths)
   */
  private parsePrimary(): Condition | Value {
    // Parentheses
    if (this.match("LPAREN")) {
      const expr = this.parseOr();
      this.consume("RPAREN", "Expected ')' after expression");
      return expr;
    }

    // Function calls or path references
    if (this.check("IDENTIFIER")) {
      const name = this.advance().value;

      // Check if followed by LPAREN for function call
      if (this.match("LPAREN")) {
        const args: Value[] = [];

        // Parse arguments
        if (!this.check("RPAREN")) {
          do {
            args.push(this.parseValue());
          } while (this.match("COMMA"));
        }

        this.consume("RPAREN", "Expected ')' after function arguments");

        return AST.fn(name, args);
      }

      // Otherwise it's just a path reference (truthy check)
      return name;
    }

    // Values (literals)
    return this.parseValue();
  }

  /**
   * Parse a value (literal or path reference)
   */
  private parseValue(): Value {
    const token = this.advance();

    switch (token.type) {
      case "NUMBER":
        return AST.literal(parseFloat(token.value));

      case "STRING":
        return AST.literal(token.value);

      case "BOOLEAN":
        return AST.literal(token.value === "true");

      case "NULL":
        return AST.literal(null);

      case "IDENTIFIER":
        return AST.ref(token.value);

      default:
        throw new Error(
          `Unexpected token '${token.value}' at position ${token.position}. Expected a value.`
        );
    }
  }

  /**
   * Check if current token matches type and optional value
   */
  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    return token.type === type && (value === undefined || token.value === value);
  }

  /**
   * Check if current token matches, and consume if it does
   */
  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  /**
   * Consume a token or throw error
   */
  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.peek();
    throw new Error(`${message} at position ${token.position}. Got '${token.value}' instead.`);
  }

  /**
   * Get current token without advancing
   */
  private peek(): Token {
    return this.tokens[this.position] ?? { type: "EOF", value: "", position: this.source.length };
  }

  /**
   * Get current token and advance
   */
  private advance(): Token {
    if (!this.isAtEnd()) {
      this.position++;
    }
    return this.tokens[this.position - 1]!;
  }

  /**
   * Check if we're at end of tokens
   */
  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }
}
