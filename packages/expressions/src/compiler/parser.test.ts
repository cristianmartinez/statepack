import { describe, expect, test } from "bun:test";
import { compile, compileToNode } from "./parser";

describe("parser", () => {
  test("compiles simple path to AST", () => {
    const result = compile("context.user.name");
    expect(result.source).toBe("context.user.name");
    expect(result.ast.type).toBe("simplePath");
    if (result.ast.type === "simplePath") {
      expect(result.ast.path.value).toBe("context.user.name");
    }
  });

  test("compiles path with single transform", () => {
    const result = compile("context.name | uppercase");
    expect(result.ast.type).toBe("pipe");
    if (result.ast.type === "pipe") {
      expect(result.ast.source.value).toBe("context.name");
      expect(result.ast.transforms).toHaveLength(1);
      expect(result.ast.transforms[0]?.name).toBe("uppercase");
      expect(result.ast.transforms[0]?.args).toHaveLength(0);
    }
  });

  test("compiles transform with numeric argument", () => {
    const result = compile("context.price | round:2");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      expect(transform.name).toBe("round");
      expect(transform.args).toHaveLength(1);
      expect(transform.args[0]).toEqual({ type: "literal", value: 2 });
    }
  });

  test("compiles transform with string arguments", () => {
    const result = compile("context.text | replace:'old':'new'");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      expect(transform.args).toHaveLength(2);
      expect(transform.args[0]).toEqual({ type: "literal", value: "old" });
      expect(transform.args[1]).toEqual({ type: "literal", value: "new" });
    }
  });

  test("compiles transform with path reference", () => {
    const result = compile("context.count | add:$quantity");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      expect(transform.args[0]).toEqual({ type: "ref", path: "quantity" });
    }
  });

  test("compiles multiple transforms", () => {
    const result = compile("context.name | trim | uppercase | truncate:20");
    if (result.ast.type === "pipe") {
      expect(result.ast.transforms).toHaveLength(3);
      expect(result.ast.transforms[0]?.name).toBe("trim");
      expect(result.ast.transforms[1]?.name).toBe("uppercase");
      expect(result.ast.transforms[2]?.name).toBe("truncate");
      expect(result.ast.transforms[2]?.args[0]).toEqual({ type: "literal", value: 20 });
    }
  });

  test("compiles boolean arguments", () => {
    const result = compile("context.isActive | if:true:'Active':'Inactive'");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      expect(transform.args[0]).toEqual({ type: "literal", value: true });
      expect(transform.args[1]).toEqual({ type: "literal", value: "Active" });
      expect(transform.args[2]).toEqual({ type: "literal", value: "Inactive" });
    }
  });

  test("compiles simple identifier path", () => {
    const result = compile("index");
    expect(result.ast.type).toBe("simplePath");
    if (result.ast.type === "simplePath") {
      expect(result.ast.path.value).toBe("index");
    }
  });

  test("AST is JSON-serializable", () => {
    const result = compile("context.users | filter:'active' | map:'name' | join:', '");
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.source).toBe("context.users | filter:'active' | map:'name' | join:', '");
    expect(parsed.ast.type).toBe("pipe");
    expect(parsed.ast.transforms).toHaveLength(3);
  });

  test("compileToNode returns just the AST node", () => {
    const node = compileToNode("context.name | uppercase");
    expect(node.type).toBe("pipe");
    expect("source" in node).toBe(true);
  });
});
