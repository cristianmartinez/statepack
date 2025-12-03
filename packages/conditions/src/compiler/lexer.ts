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

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export class Lexer {
  private input: string;
  private position = 0;
  private tokens: Token[] = [];

  constructor(input: string) {
    this.input = input.trim();
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.position = 0;

    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) {
        break;
      }

      const char = this.peek();

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

      if (char === ",") {
        this.addToken("COMMA", ",");
        this.advance();
        continue;
      }

      if (char === "'" || char === '"') {
        this.readString(char);
        continue;
      }

      // Check for operators (multi-character first)
      if (this.matchOperator()) {
        continue;
      }

      if (this.isDigit(char) || (char === "-" && this.isDigit(this.peekNext()))) {
        this.readNumber();
        continue;
      }

      if (this.isIdentifierStart(char)) {
        this.readIdentifier();
        continue;
      }

      throw new Error(`Unexpected character '${char}' at position ${this.position}`);
    }

    this.addToken("EOF", "");
    return this.tokens;
  }

  private peek(): string {
    return this.input[this.position] ?? "";
  }

  private peekNext(): string {
    return this.input[this.position + 1] ?? "";
  }

  private advance(): string {
    return this.input[this.position++] ?? "";
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      position: this.position - value.length,
    });
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position]!)) {
      this.position++;
    }
  }

  private isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
  }

  private isIdentifierStart(char: string): boolean {
    return /[a-zA-Z_$]/.test(char);
  }

  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_$.]/.test(char);
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

  private readString(quote: string): void {
    const startPos = this.position;
    this.advance(); // Skip opening quote

    let value = "";
    while (this.position < this.input.length) {
      const char = this.peek();

      if (char === "\\") {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case "r":
            value += "\r";
            break;
          case "\\":
            value += "\\";
            break;
          case "'":
            value += "'";
            break;
          case '"':
            value += '"';
            break;
          default:
            value += escaped;
        }
        continue;
      }

      if (char === quote) {
        this.advance(); // Skip closing quote
        this.tokens.push({
          type: "STRING",
          value,
          position: startPos,
        });
        return;
      }

      value += this.advance();
    }

    throw new Error(`Unterminated string starting at position ${startPos}`);
  }

  private readNumber(): void {
    const startPos = this.position;
    let value = "";

    if (this.peek() === "-") {
      value += this.advance();
    }

    while (this.isDigit(this.peek())) {
      value += this.advance();
    }

    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      value += this.advance(); // Add decimal point
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    this.tokens.push({
      type: "NUMBER",
      value,
      position: startPos,
    });
  }

  private readIdentifier(): void {
    const startPos = this.position;
    let value = "";

    while (this.position < this.input.length && this.isIdentifierChar(this.peek())) {
      value += this.advance();
    }

    // Check for keywords
    if (value === "true" || value === "false") {
      this.tokens.push({
        type: "BOOLEAN",
        value,
        position: startPos,
      });
      return;
    }

    if (value === "null") {
      this.tokens.push({
        type: "NULL",
        value,
        position: startPos,
      });
      return;
    }

    // Regular identifier (function name or path)
    this.tokens.push({
      type: "IDENTIFIER",
      value,
      position: startPos,
    });
  }
}

export function tokenize(expression: string): Token[] {
  return new Lexer(expression).tokenize();
}
