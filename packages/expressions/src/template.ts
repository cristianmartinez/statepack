/**
 * Template binding utilities for extracting and detecting
 * expression bindings in template strings like "Hello, {{name}}!"
 */

/**
 * Extract all binding expressions from a template string
 * Returns the parts and the expressions
 *
 * Example: "Hello, {{name}}!" -> { parts: ["Hello, ", "!"], expressions: ["name"] }
 */
export function extractBindings(template: string): { parts: string[]; expressions: string[] } {
  const parts: string[] = [];
  const expressions: string[] = [];
  let current = "";
  let i = 0;

  while (i < template.length) {
    // Check for opening {{
    if (template[i] === "{" && template[i + 1] === "{") {
      parts.push(current);
      current = "";
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

      expressions.push(expr);
    } else {
      current += template[i];
      i++;
    }
  }

  parts.push(current);

  return { parts, expressions };
}

/**
 * Check if a string contains binding expressions
 */
export function hasBindings(str: string): boolean {
  return str.includes("{{") && str.includes("}}");
}
