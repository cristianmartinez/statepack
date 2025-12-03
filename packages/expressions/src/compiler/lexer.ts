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

      if (char === "'" || char === '"') {
        this.readString(char);
        continue;
      }

      if (char === "$") {
        this.readRef();
        continue;
      }

      if (this.isDigit(char) || (char === "-" && this.isDigit(this.peekNext()))) {
        this.readNumber();
        continue;
      }

      if (this.isIdentifierStart(char)) {
        this.readIdentifierOrPath();
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
    return /[a-zA-Z_]/.test(char);
  }

  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }

  private readString(quote: string): void {
    const startPos = this.position;
    this.advance();

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
        this.advance();
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
      value += this.advance();
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

  private readRef(): void {
    const startPos = this.position;
    this.advance();

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

    this.tokens.push({
      type: "REF",
      value: path,
      position: startPos,
    });
  }

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

    const tokenType = value.includes(".") || value.includes("[") ? "PATH" : "IDENTIFIER";

    this.tokens.push({
      type: tokenType,
      value,
      position: startPos,
    });
  }
}

export function tokenize(expression: string): Token[] {
  return new Lexer(expression).tokenize();
}
