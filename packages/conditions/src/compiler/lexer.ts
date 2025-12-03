import { BaseLexer, type Token } from "@ouni/compiler";

export type TokenType =
  | "IDENTIFIER"
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "NULL"
  | "OPERATOR"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

export class Lexer extends BaseLexer<TokenType> {
  constructor(input: string) {
    super(input.trim());
  }

  tokenize(): Token<TokenType>[] {
    this.tokens = [];
    this.position = 0;

    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) {
        break;
      }

      const char = this.peek();

      if (char === "(") {
        const startPos = this.position;
        this.advance();
        this.addToken("LPAREN", "(", startPos);
        continue;
      }

      if (char === ")") {
        const startPos = this.position;
        this.advance();
        this.addToken("RPAREN", ")", startPos);
        continue;
      }

      if (char === ",") {
        const startPos = this.position;
        this.advance();
        this.addToken("COMMA", ",", startPos);
        continue;
      }

      if (char === "'" || char === '"') {
        const startPos = this.position;
        const value = this.readString(char);
        this.addToken("STRING", value, startPos);
        continue;
      }

      // Check for operators (multi-character first)
      if (this.matchOperator()) {
        continue;
      }

      if (this.isDigit(char) || (char === "-" && this.isDigit(this.peekNext()))) {
        const startPos = this.position;
        const value = this.readNumber();
        this.addToken("NUMBER", value, startPos);
        continue;
      }

      if (this.isIdentifierStart(char)) {
        const startPos = this.position;
        this.readIdentifierOrKeyword(startPos);
        continue;
      }

      throw new Error(`Unexpected character '${char}' at position ${this.position}`);
    }

    this.addToken("EOF", "");
    return this.tokens;
  }

  private matchOperator(): boolean {
    const startPos = this.position;

    // Try 3-character operators
    if (this.position + 2 < this.input.length) {
      const threeChar = this.input.slice(this.position, this.position + 3);
      if (threeChar === "===" || threeChar === "!==") {
        this.tokens.push({ type: "OPERATOR", value: threeChar, position: startPos });
        this.position += 3;
        return true;
      }
    }

    // Try 2-character operators
    if (this.position + 1 < this.input.length) {
      const twoChar = this.input.slice(this.position, this.position + 2);
      if ([">=", "<=", "==", "!=", "&&", "||"].includes(twoChar)) {
        this.tokens.push({ type: "OPERATOR", value: twoChar, position: startPos });
        this.position += 2;
        return true;
      }
    }

    // Single character operators
    const char = this.peek();
    if (["!", ">", "<"].includes(char)) {
      this.tokens.push({ type: "OPERATOR", value: char, position: startPos });
      this.position++;
      return true;
    }

    return false;
  }

  private readIdentifierOrKeyword(startPos: number): void {
    const value = this.readIdentifier();

    // Check for keywords
    if (value === "true" || value === "false") {
      this.addToken("BOOLEAN", value, startPos);
      return;
    }

    if (value === "null") {
      this.addToken("NULL", value, startPos);
      return;
    }

    // Regular identifier (function name or path)
    this.addToken("IDENTIFIER", value, startPos);
  }
}

export function tokenize(expression: string): Token<TokenType>[] {
  return new Lexer(expression).tokenize();
}
