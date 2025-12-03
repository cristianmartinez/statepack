/**
 * Compiler entry point for conditions
 */

import type { Condition } from "../types";
import type { CompiledCondition } from "./ast";
import { Parser } from "./parser";

/**
 * Compile a condition string into a structured Condition AST
 *
 * This is a multi-stage compiler:
 * 1. Tokenize - Break string into tokens (via Lexer)
 * 2. Parse - Build AST with proper operator precedence
 *
 * @param expr The condition expression string
 * @returns A compiled condition with source and AST
 */
export function compile(expr: string): CompiledCondition {
  return new Parser(expr).compile();
}

/**
 * Compile a condition string and return just the AST
 * @param expr The condition expression string
 * @returns The Condition AST
 */
export function compileToAST(expr: string): Condition {
  return compile(expr).ast;
}

export { tokenize, Lexer } from "./lexer";
export { Parser } from "./parser";
export { AST } from "./ast";
export type { Token, TokenType } from "./lexer";
export type { CompiledCondition } from "./ast";
