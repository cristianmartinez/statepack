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

  test("compiles object literal with simple values", () => {
    const result = compile("context.todos | append:{id: 1, text: 'Hello', completed: false}");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      expect(transform.name).toBe("append");
      expect(transform.args).toHaveLength(1);

      const objectArg = transform.args[0]!;
      expect(objectArg.type).toBe("object");
      if (objectArg.type === "object") {
        expect(objectArg.properties.id).toEqual({ type: "literal", value: 1 });
        expect(objectArg.properties.text).toEqual({ type: "literal", value: "Hello" });
        expect(objectArg.properties.completed).toEqual({ type: "literal", value: false });
      }
    }
  });

  test("compiles object literal with references", () => {
    const result = compile("context.todos | append:{id: $eventId, text: $text}");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      const objectArg = transform.args[0]!;

      if (objectArg.type === "object") {
        expect(objectArg.properties.id).toEqual({ type: "ref", path: "eventId" });
        expect(objectArg.properties.text).toEqual({ type: "ref", path: "text" });
      }
    }
  });

  test("compiles nested object literals", () => {
    const result = compile("context.data | set:{user: {name: 'Alice', age: 30}}");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      const objectArg = transform.args[0]!;

      if (objectArg.type === "object") {
        const userProp = objectArg.properties.user;
        expect(userProp?.type).toBe("object");
        if (userProp?.type === "object") {
          expect(userProp.properties.name).toEqual({ type: "literal", value: "Alice" });
          expect(userProp.properties.age).toEqual({ type: "literal", value: 30 });
        }
      }
    }
  });

  test("compiles array literal with simple values", () => {
    const result = compile("context.items | concat:[1, 2, 3]");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      expect(transform.args).toHaveLength(1);

      const arrayArg = transform.args[0]!;
      expect(arrayArg.type).toBe("array");
      if (arrayArg.type === "array") {
        expect(arrayArg.elements).toHaveLength(3);
        expect(arrayArg.elements[0]).toEqual({ type: "literal", value: 1 });
        expect(arrayArg.elements[1]).toEqual({ type: "literal", value: 2 });
        expect(arrayArg.elements[2]).toEqual({ type: "literal", value: 3 });
      }
    }
  });

  test("compiles array literal with references", () => {
    const result = compile("context.list | merge:[$item1, $item2]");
    if (result.ast.type === "pipe") {
      const transform = result.ast.transforms[0]!;
      const arrayArg = transform.args[0]!;

      if (arrayArg.type === "array") {
        expect(arrayArg.elements[0]).toEqual({ type: "ref", path: "item1" });
        expect(arrayArg.elements[1]).toEqual({ type: "ref", path: "item2" });
      }
    }
  });

  test("compiles empty object literal", () => {
    const result = compile("context.data | merge:{}");
    if (result.ast.type === "pipe") {
      const objectArg = result.ast.transforms[0]!.args[0]!;
      expect(objectArg.type).toBe("object");
      if (objectArg.type === "object") {
        expect(Object.keys(objectArg.properties)).toHaveLength(0);
      }
    }
  });

  test("compiles empty array literal", () => {
    const result = compile("context.data | merge:[]");
    if (result.ast.type === "pipe") {
      const arrayArg = result.ast.transforms[0]!.args[0]!;
      expect(arrayArg.type).toBe("array");
      if (arrayArg.type === "array") {
        expect(arrayArg.elements).toHaveLength(0);
      }
    }
  });

  test("compiles object with quoted string keys", () => {
    const result = compile("context.data | set:{'first-name': 'John', 'last-name': 'Doe'}");
    if (result.ast.type === "pipe") {
      const objectArg = result.ast.transforms[0]!.args[0]!;
      if (objectArg.type === "object") {
        expect(objectArg.properties["first-name"]).toEqual({ type: "literal", value: "John" });
        expect(objectArg.properties["last-name"]).toEqual({ type: "literal", value: "Doe" });
      }
    }
  });
});
