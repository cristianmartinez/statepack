import { describe, expect, test } from "bun:test";
import { tokenize } from "./lexer";

describe("Lexer - Basic tokens", () => {
  test("tokenizes identifiers", () => {
    const tokens = tokenize("context.user.name");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "context.user.name", position: 0 },
      { type: "EOF", value: "", position: 17 },
    ]);
  });

  test("tokenizes numbers", () => {
    expect(tokenize("42")).toEqual([
      { type: "NUMBER", value: "42", position: 0 },
      { type: "EOF", value: "", position: 2 },
    ]);

    expect(tokenize("3.14")).toEqual([
      { type: "NUMBER", value: "3.14", position: 0 },
      { type: "EOF", value: "", position: 4 },
    ]);

    expect(tokenize("-10")).toEqual([
      { type: "NUMBER", value: "-10", position: 0 },
      { type: "EOF", value: "", position: 3 },
    ]);
  });

  test("tokenizes strings", () => {
    expect(tokenize('"hello"')).toEqual([
      { type: "STRING", value: "hello", position: 0 },
      { type: "EOF", value: "", position: 7 },
    ]);

    expect(tokenize("'world'")).toEqual([
      { type: "STRING", value: "world", position: 0 },
      { type: "EOF", value: "", position: 7 },
    ]);
  });

  test("tokenizes string with escapes", () => {
    const tokens = tokenize('"hello\\nworld"');
    expect(tokens[0]).toEqual({ type: "STRING", value: "hello\nworld", position: 0 });
  });

  test("tokenizes booleans", () => {
    expect(tokenize("true")).toEqual([
      { type: "BOOLEAN", value: "true", position: 0 },
      { type: "EOF", value: "", position: 4 },
    ]);

    expect(tokenize("false")).toEqual([
      { type: "BOOLEAN", value: "false", position: 0 },
      { type: "EOF", value: "", position: 5 },
    ]);
  });

  test("tokenizes null", () => {
    expect(tokenize("null")).toEqual([
      { type: "NULL", value: "null", position: 0 },
      { type: "EOF", value: "", position: 4 },
    ]);
  });

  test("tokenizes parentheses", () => {
    const tokens = tokenize("(a)");
    expect(tokens).toEqual([
      { type: "LPAREN", value: "(", position: 0 },
      { type: "IDENTIFIER", value: "a", position: 1 },
      { type: "RPAREN", value: ")", position: 2 },
      { type: "EOF", value: "", position: 3 },
    ]);
  });

  test("tokenizes comma", () => {
    const tokens = tokenize("a, b");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "a", position: 0 },
      { type: "COMMA", value: ",", position: 1 },
      { type: "IDENTIFIER", value: "b", position: 3 },
      { type: "EOF", value: "", position: 4 },
    ]);
  });
});

describe("Lexer - Operators", () => {
  test("tokenizes comparison operators", () => {
    expect(tokenize("===")[0]).toEqual({ type: "OPERATOR", value: "===", position: 0 });
    expect(tokenize("!==")[0]).toEqual({ type: "OPERATOR", value: "!==", position: 0 });
    expect(tokenize("==")[0]).toEqual({ type: "OPERATOR", value: "==", position: 0 });
    expect(tokenize("!=")[0]).toEqual({ type: "OPERATOR", value: "!=", position: 0 });
    expect(tokenize(">=")[0]).toEqual({ type: "OPERATOR", value: ">=", position: 0 });
    expect(tokenize("<=")[0]).toEqual({ type: "OPERATOR", value: "<=", position: 0 });
    expect(tokenize(">")[0]).toEqual({ type: "OPERATOR", value: ">", position: 0 });
    expect(tokenize("<")[0]).toEqual({ type: "OPERATOR", value: "<", position: 0 });
  });

  test("tokenizes logical operators", () => {
    expect(tokenize("&&")[0]).toEqual({ type: "OPERATOR", value: "&&", position: 0 });
    expect(tokenize("||")[0]).toEqual({ type: "OPERATOR", value: "||", position: 0 });
    expect(tokenize("!")[0]).toEqual({ type: "OPERATOR", value: "!", position: 0 });
  });
});

describe("Lexer - Complex expressions", () => {
  test("tokenizes simple comparison", () => {
    const tokens = tokenize("age > 18");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "age", position: 0 },
      { type: "OPERATOR", value: ">", position: 4 },
      { type: "NUMBER", value: "18", position: 6 },
      { type: "EOF", value: "", position: 8 },
    ]);
  });

  test("tokenizes AND expression", () => {
    const tokens = tokenize("a && b");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "a", position: 0 },
      { type: "OPERATOR", value: "&&", position: 2 },
      { type: "IDENTIFIER", value: "b", position: 5 },
      { type: "EOF", value: "", position: 6 },
    ]);
  });

  test("tokenizes OR expression", () => {
    const tokens = tokenize("a || b");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "a", position: 0 },
      { type: "OPERATOR", value: "||", position: 2 },
      { type: "IDENTIFIER", value: "b", position: 5 },
      { type: "EOF", value: "", position: 6 },
    ]);
  });

  test("tokenizes NOT expression", () => {
    const tokens = tokenize("!active");
    expect(tokens).toEqual([
      { type: "OPERATOR", value: "!", position: 0 },
      { type: "IDENTIFIER", value: "active", position: 1 },
      { type: "EOF", value: "", position: 7 },
    ]);
  });

  test("tokenizes function call", () => {
    const tokens = tokenize("isEmpty(name)");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "isEmpty", position: 0 },
      { type: "LPAREN", value: "(", position: 7 },
      { type: "IDENTIFIER", value: "name", position: 8 },
      { type: "RPAREN", value: ")", position: 12 },
      { type: "EOF", value: "", position: 13 },
    ]);
  });

  test("tokenizes function with multiple args", () => {
    const tokens = tokenize('match(status, "active", "pending")');
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "match", position: 0 },
      { type: "LPAREN", value: "(", position: 5 },
      { type: "IDENTIFIER", value: "status", position: 6 },
      { type: "COMMA", value: ",", position: 12 },
      { type: "STRING", value: "active", position: 14 },
      { type: "COMMA", value: ",", position: 22 },
      { type: "STRING", value: "pending", position: 24 },
      { type: "RPAREN", value: ")", position: 33 },
      { type: "EOF", value: "", position: 34 },
    ]);
  });

  test("tokenizes nested parentheses", () => {
    const tokens = tokenize("(a > 5 && b < 10) || (c === 'test')");
    expect(tokens[0]).toEqual({ type: "LPAREN", value: "(", position: 0 });
    expect(tokens[1]).toEqual({ type: "IDENTIFIER", value: "a", position: 1 });
    expect(tokens[2]).toEqual({ type: "OPERATOR", value: ">", position: 3 });
    expect(tokens[3]).toEqual({ type: "NUMBER", value: "5", position: 5 });
    expect(tokens[4]).toEqual({ type: "OPERATOR", value: "&&", position: 7 });
  });
});

describe("Lexer - Whitespace handling", () => {
  test("handles multiple spaces", () => {
    const tokens = tokenize("a    >    5");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "a", position: 0 },
      { type: "OPERATOR", value: ">", position: 5 },
      { type: "NUMBER", value: "5", position: 10 },
      { type: "EOF", value: "", position: 11 },
    ]);
  });

  test("handles tabs and newlines", () => {
    const tokens = tokenize("a\t>\n5");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "a", position: 0 },
      { type: "OPERATOR", value: ">", position: 2 },
      { type: "NUMBER", value: "5", position: 4 },
      { type: "EOF", value: "", position: 5 },
    ]);
  });
});

describe("Lexer - Error cases", () => {
  test("throws on unexpected character", () => {
    expect(() => tokenize("@invalid")).toThrow("Unexpected character '@'");
  });

  test("throws on unterminated string", () => {
    expect(() => tokenize('"unterminated')).toThrow("Unterminated string");
  });
});
