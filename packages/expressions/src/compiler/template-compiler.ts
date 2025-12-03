import type { ExpressionNode } from "./ast";
import { compile } from "./parser";

/**
 * A part of a compiled template - either static text or an expression to evaluate
 */
export interface TemplatePart {
  type: "static" | "expression";
  value: string | ExpressionNode;
}

/**
 * A compiled template with pre-parsed expression ASTs
 */
export interface CompiledTemplate {
  source: string;
  parts: TemplatePart[];
}

/**
 * Compile a template string into parts with pre-parsed expressions
 *
 * Example: "Hello {{name}}" -> [
 *   { type: "static", value: "Hello " },
 *   { type: "expression", value: <AST for "name"> }
 * ]
 */
export function compileTemplate(template: string): CompiledTemplate {
  const parts: TemplatePart[] = [];
  let current = "";
  let i = 0;

  while (i < template.length) {
    // Check for opening {{
    if (template[i] === "{" && template[i + 1] === "{") {
      // Push accumulated static text
      if (current.length > 0) {
        parts.push({ type: "static", value: current });
        current = "";
      }

      i += 2;

      // Find closing }}
      let depth = 1;
      let expr = "";
      while (i < template.length && depth > 0) {
        if (template[i] === "{" && template[i + 1] === "{") {
          depth++;
          expr += "{{";
          i += 2;
        } else if (template[i] === "}" && template[i + 1] === "}") {
          depth--;
          if (depth > 0) {
            expr += "}}";
          }
          i += 2;
        } else {
          expr += template[i];
          i++;
        }
      }

      // Compile the expression to AST
      const trimmedExpr = expr.trim();
      if (trimmedExpr.length > 0) {
        const ast = compile(trimmedExpr);
        parts.push({ type: "expression", value: ast.ast });
      }
    } else {
      current += template[i];
      i++;
    }
  }

  // Push remaining static text
  if (current.length > 0) {
    parts.push({ type: "static", value: current });
  }

  return {
    source: template,
    parts,
  };
}
