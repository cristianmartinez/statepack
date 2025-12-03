/**
 * Parse a string expression into a Condition
 * Supports: path lookups, comparisons, &&, ||, !, functions
 *
 * Operator precedence (lowest to highest):
 * 1. || (OR)
 * 2. && (AND)
 * 3. ! (NOT)
 * 4. Comparisons (===, !==, >, <, etc.)
 * 5. Function calls, parentheses
 */

import type { CompareOp, Condition, Value } from "./types";

/**
 * Parse a string expression into a structured Condition
 * @param expr The expression string to parse
 * @returns A Condition object
 */
export function parseExpression(expr: string): Condition {
  const trimmed = expr.trim();

  // Handle || (OR) - LOWEST precedence (parse first)
  if (hasOperator(trimmed, " || ")) {
    const parts = splitByOperator(trimmed, " || ");
    return {
      type: "or",
      conditions: parts.map(parseExpression),
    };
  }

  // Handle && (AND) - HIGHER precedence than ||
  if (hasOperator(trimmed, " && ")) {
    const parts = splitByOperator(trimmed, " && ");
    return {
      type: "and",
      conditions: parts.map(parseExpression),
    };
  }

  // Handle parentheses
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return parseExpression(trimmed.slice(1, -1));
  }

  // Handle ! (NOT) prefix
  if (trimmed.startsWith("!") && !trimmed.startsWith("!=")) {
    return {
      type: "not",
      condition: parseExpression(trimmed.slice(1)),
    };
  }

  // Handle function calls: isEmpty(), isDefined(), etc.
  const funcMatch = trimmed.match(/^(\w+)\((.*)\)$/);
  if (funcMatch) {
    const funcName = funcMatch[1]!;
    const argsStr = funcMatch[2] || "";
    const args: Value[] = argsStr
      .split(",")
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0)
      .map(parseValue);

    return {
      type: "fn",
      name: funcName,
      args,
    };
  }

  // Handle comparison operators
  const comparisonOps: CompareOp[] = ["!==", "===", "!=", "==", ">=", "<=", ">", "<"];
  for (const op of comparisonOps) {
    const idx = trimmed.indexOf(` ${op} `);
    if (idx !== -1) {
      const left = trimmed.slice(0, idx).trim();
      const right = trimmed.slice(idx + op.length + 2).trim();
      return {
        type: "compare",
        op,
        left: parseValue(left),
        right: parseValue(right),
      };
    }
  }

  // Simple truthy check - just a path
  return trimmed;
}

/**
 * Parse a value (can be a literal or path reference)
 */
function parseValue(expr: string): Value {
  const trimmed = expr.trim();

  // Handle numeric literals
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return {
      type: "literal",
      value: parseFloat(trimmed),
    };
  }

  // Handle boolean literals
  if (trimmed === "true") {
    return { type: "literal", value: true };
  }
  if (trimmed === "false") {
    return { type: "literal", value: false };
  }

  // Handle null
  if (trimmed === "null") {
    return { type: "literal", value: null };
  }

  // Handle string literals (quoted)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return {
      type: "literal",
      value: trimmed.slice(1, -1),
    };
  }

  // Treat as path reference
  return { type: "ref", path: trimmed };
}

/**
 * Check if expression has operator outside of quotes/parens
 */
function hasOperator(expr: string, op: string): boolean {
  let depth = 0;
  let inQuote: string | null = null;

  for (let i = 0; i < expr.length - op.length + 1; i++) {
    const char = expr[i];

    // Handle quotes
    if ((char === '"' || char === "'") && (i === 0 || expr[i - 1] !== "\\")) {
      if (inQuote === char) {
        inQuote = null;
      } else if (!inQuote) {
        inQuote = char;
      }
      continue;
    }

    if (inQuote) continue;

    // Handle parentheses
    if (char === "(") depth++;
    if (char === ")") depth--;

    // Check for operator at depth 0
    if (depth === 0 && expr.slice(i, i + op.length) === op) {
      return true;
    }
  }

  return false;
}

/**
 * Split expression by operator, respecting quotes and parens
 */
function splitByOperator(expr: string, op: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote: string | null = null;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    // Handle quotes
    if ((char === '"' || char === "'") && (i === 0 || expr[i - 1] !== "\\")) {
      if (inQuote === char) {
        inQuote = null;
      } else if (!inQuote) {
        inQuote = char;
      }
    }

    if (!inQuote) {
      // Handle parentheses
      if (char === "(") depth++;
      if (char === ")") depth--;

      // Check for operator at depth 0
      if (depth === 0 && expr.slice(i, i + op.length) === op) {
        parts.push(current.trim());
        current = "";
        i += op.length - 1; // Skip operator
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}
