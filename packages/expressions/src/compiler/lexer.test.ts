import { describe, expect, test } from "bun:test";
import { tokenize } from "./lexer.ts";

describe("lexer", () => {
  test("tokenizes simple path", () => {
    const tokens = tokenize("context.user.name");
    expect(tokens).toHaveLength(2); // PATH + EOF
    expect(tokens[0]).toEqual({ type: "PATH", value: "context.user.name", position: 0 });
  });

  test("tokenizes path with pipe", () => {
    const tokens = tokenize("context.name | uppercase");
    expect(tokens).toHaveLength(4); // PATH + PIPE + IDENTIFIER + EOF
    expect(tokens[0]?.type).toBe("PATH");
    expect(tokens[1]?.type).toBe("PIPE");
    expect(tokens[2]?.type).toBe("IDENTIFIER");
  });

  test("tokenizes transform with numeric arg", () => {
    const tokens = tokenize("context.price | round:2");
    expect(tokens[2]?.type).toBe("IDENTIFIER");
    expect(tokens[2]?.value).toBe("round");
    expect(tokens[3]?.type).toBe("COLON");
    expect(tokens[4]?.type).toBe("NUMBER");
    expect(tokens[4]?.value).toBe("2");
  });

  test("tokenizes transform with string arg", () => {
    const tokens = tokenize("context.text | replace:'old':'new'");
    expect(tokens[4]?.type).toBe("STRING");
    expect(tokens[4]?.value).toBe("old");
    expect(tokens[6]?.type).toBe("STRING");
    expect(tokens[6]?.value).toBe("new");
  });

  test("tokenizes path reference", () => {
    const tokens = tokenize("context.count | add:$quantity");
    expect(tokens[4]?.type).toBe("REF");
    expect(tokens[4]?.value).toBe("quantity");
  });

  test("tokenizes boolean values", () => {
    const tokens = tokenize("context.flag | if:true:'yes':'no'");
    expect(tokens[4]?.type).toBe("BOOLEAN");
    expect(tokens[4]?.value).toBe("true");
  });

  test("tokenizes null", () => {
    const tokens = tokenize("context.value | default:null");
    expect(tokens[4]?.type).toBe("NULL");
  });

  test("tokenizes negative numbers", () => {
    const tokens = tokenize("context.x | add:-5");
    expect(tokens[4]?.type).toBe("NUMBER");
    expect(tokens[4]?.value).toBe("-5");
  });

  test("tokenizes array access in path", () => {
    const tokens = tokenize("context.items[0]");
    expect(tokens[0]?.type).toBe("PATH");
    expect(tokens[0]?.value).toBe("context.items[0]");
  });
});
