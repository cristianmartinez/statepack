import { BaseLexer, type Token } from "@ouni/compiler";

export type { Token };

export type TokenType =
  | "PATH"
  | "PIPE"
  | "COLON"
  | "STRING"
  | "NUMBER"
  | "BOOLEAN"
  | "NULL"
  | "REF"
  | "IDENTIFIER"
  | "LPAREN"
  | "RPAREN"
  | "LBRACKET"
  | "RBRACKET"
  | "EOF";

export class Lexer extends BaseLexer<TokenType> {
  tokenize(): Token<TokenType>[] {
    this.tokens = [];
    this.position = 0;

    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) {
        break;
      }

      const char = this.peek();

      // Domain-specific single-character tokens
      if (char === "|") {
        this.addToken("PIPE", "|");
        this.advance();
        continue;
      }

      if (char === ":") {
        this.addToken("COLON", ":");
        this.advance();
        continue;
      }

      if (char === "(") {
        this.addToken("LPAREN", "(");
        this.advance();
        continue;
      }

      if (char === ")") {
        this.addToken("RPAREN", ")");
        this.advance();
        continue;
      }

      if (char === "[") {
        this.addToken("LBRACKET", "[");
        this.advance();
        continue;
      }

      if (char === "]") {
        this.addToken("RBRACKET", "]");
        this.advance();
        continue;
      }

      // String literals - use inherited method
      if (char === "'" || char === '"') {
        const value = this.readString(char);
        this.addToken("STRING", value);
        continue;
      }

      // References starting with $ (domain-specific)
      if (char === "$") {
        this.readRef();
        continue;
      }

      // Numbers - use inherited method
      if (this.isDigit(char) || (char === "-" && this.isDigit(this.peekNext()))) {
        const value = this.readNumber();
        this.addToken("NUMBER", value);
        continue;
      }

      // Identifiers/paths - domain-specific logic
      if (this.isIdentifierStart(char)) {
        this.readIdentifierOrPath();
        continue;
      }

      throw new Error(`Unexpected character '${char}' at position ${this.position}`);
    }

    this.addToken("EOF", "");
    return this.tokens;
  }

  /**
   * Read a reference starting with $ (domain-specific)
   */
  private readRef(): void {
    const startPos = this.position;
    this.advance(); // Skip $

    let path = "";
    while (
      this.position < this.input.length &&
      (this.isIdentifierChar(this.peek()) ||
        this.peek() === "." ||
        this.peek() === "[" ||
        this.peek() === "]")
    ) {
      if (this.peek() === "[") {
        path += this.advance();
        while (this.position < this.input.length && this.peek() !== "]") {
          path += this.advance();
        }
        if (this.peek() === "]") {
          path += this.advance();
        }
      } else {
        path += this.advance();
      }
    }

    this.addToken("REF", path);
  }

  /**
   * Read identifier or path (domain-specific)
   * Handles dots and bracket notation for property access
   */
  private readIdentifierOrPath(): void {
    const startPos = this.position;
    let value = "";

    while (this.position < this.input.length) {
      const char = this.peek();

      if (this.isIdentifierChar(char) || char === ".") {
        value += this.advance();
        continue;
      }

      if (char === "[") {
        value += this.advance();
        while (this.position < this.input.length && this.peek() !== "]") {
          value += this.advance();
        }
        if (this.peek() === "]") {
          value += this.advance();
        }
        continue;
      }

      break;
    }

    // Check for keywords
    if (value === "true" || value === "false") {
      this.addToken("BOOLEAN", value);
      return;
    }

    if (value === "null") {
      this.addToken("NULL", value);
      return;
    }

    // Determine if it's a PATH or simple IDENTIFIER
    const tokenType = value.includes(".") || value.includes("[") ? "PATH" : "IDENTIFIER";
    this.addToken(tokenType, value);
  }
}

export function tokenize(expression: string): Token<TokenType>[] {
  return new Lexer(expression).tokenize();
}
