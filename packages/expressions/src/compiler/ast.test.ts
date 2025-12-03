import { describe, expect, test } from "bun:test";
import { compile } from "./parser";

describe("AST JSON structure", () => {
  test("simple path produces expected JSON", () => {
    const result = compile("context.user.name");
    expect(result).toEqual({
      source: "context.user.name",
      ast: {
        type: "simplePath",
        path: {
          type: "path",
          value: "context.user.name",
        },
      },
    });
  });

  test("pipe expression produces expected JSON", () => {
    const result = compile("context.price | round:2 | currency");
    expect(result).toEqual({
      source: "context.price | round:2 | currency",
      ast: {
        type: "pipe",
        source: {
          type: "path",
          value: "context.price",
        },
        transforms: [
          {
            type: "transform",
            name: "round",
            args: [{ type: "literal", value: 2 }],
          },
          {
            type: "transform",
            name: "currency",
            args: [],
          },
        ],
      },
    });
  });

  test("complex expression with refs produces expected JSON", () => {
    const result = compile("context.items | filter:'active' | map:'name' | join:$separator");
    expect(result).toEqual({
      source: "context.items | filter:'active' | map:'name' | join:$separator",
      ast: {
        type: "pipe",
        source: {
          type: "path",
          value: "context.items",
        },
        transforms: [
          {
            type: "transform",
            name: "filter",
            args: [{ type: "literal", value: "active" }],
          },
          {
            type: "transform",
            name: "map",
            args: [{ type: "literal", value: "name" }],
          },
          {
            type: "transform",
            name: "join",
            args: [{ type: "ref", path: "separator" }],
          },
        ],
      },
    });
  });
});
