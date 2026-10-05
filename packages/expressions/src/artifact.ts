import { Opcode, type BytecodeProgram } from "@cristianmartinez/yexp";
import type { CompiledYexpExpression } from "./engine";

/** Check JSON fidelity before serialization can silently drop or change values. */
export function assertPortableJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
    throw new Error("Portable artifacts require finite JSON values and plain objects");
  }
  if (ancestors.has(value)) throw new Error("Portable artifacts cannot contain cycles");
  if (Object.getOwnPropertySymbols(value).length) throw new Error("Portable artifacts cannot contain symbol keys");
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertPortableJson(value[index], ancestors);
    if (Object.keys(value).length !== value.length) throw new Error("Portable arrays cannot contain extra properties");
  } else {
    for (const item of Object.values(value)) assertPortableJson(item, ancestors);
  }
  ancestors.delete(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Yexp artifact object");
  return value as Record<string, unknown>;
}

const opcodes = new Set(Object.values(Opcode).filter(value => typeof value === "number"));

/** Structural checks, not a sandbox or a proof of termination/stack correctness. */
function validateProgram(value: unknown): void {
  const program = record(value);
  if (program.version !== 1) throw new Error("Unsupported Yexp bytecode version");
  if (!Array.isArray(program.slots) || !program.slots.every(slot => typeof slot === "string") ||
      !Array.isArray(program.constants) || !Array.isArray(program.code) || !program.code.length) {
    throw new Error("Invalid Yexp program tables");
  }
  for (const instruction of program.code) {
    if (!Array.isArray(instruction) || !opcodes.has(instruction[0])) throw new Error("Invalid Yexp opcode");
    const [opcode, operand] = instruction;
    const range = opcode >= Opcode.RANGE_CHECK && opcode <= Opcode.RANGE_CHECK_HI_INCLUSIVE;
    const fused = (opcode >= Opcode.LOAD_GT_CONST && opcode <= Opcode.LOAD_STRICT_NEQ_CONST) ||
      (opcode >= Opcode.LOAD_ADD_CONST && opcode <= Opcode.LOAD_MOD_CONST);
    const slot = opcode === Opcode.LOAD || range || fused || opcode === Opcode.INCREMENT || opcode === Opcode.DECREMENT ||
      (opcode >= Opcode.IS_NULL && opcode <= Opcode.IS_FALSY) || (opcode >= Opcode.SET_PATH && opcode <= Opcode.APPEND_PATH);
    const jump = opcode === Opcode.JUMP || opcode === Opcode.JUMP_IF_FALSE || opcode === Opcode.JUMP_IF_TRUE;
    const index = opcode === Opcode.INDEX || opcode === Opcode.OPTIONAL_INDEX || opcode === Opcode.OPTIONAL_CHAIN_INDEX;
    const count = opcode === Opcode.MAKE_ARRAY || opcode === Opcode.MAKE_OBJ;
    const arity = range ? 4 : fused || opcode === Opcode.CALL ? 3 :
      slot || jump || index || count || opcode === Opcode.CONST || opcode === Opcode.OPTIONAL_CHAIN_GET ? 2 : 1;
    if (instruction.length !== arity) throw new Error("Invalid Yexp instruction operands");
    if (opcode === Opcode.CONST || slot) {
      const length = opcode === Opcode.CONST ? program.constants.length : program.slots.length;
      if (!Number.isInteger(operand) || operand < 0 || operand >= length) throw new Error("Invalid Yexp table reference");
    }
    if (range && (typeof instruction[2] !== "number" || typeof instruction[3] !== "number")) {
      throw new Error("Invalid Yexp range operands");
    }
    if (index && typeof operand !== "number") throw new Error("Invalid Yexp index operand");
    if (count && (!Number.isInteger(operand) || operand < 0)) throw new Error("Invalid Yexp collection count");
    if (opcode === Opcode.OPTIONAL_CHAIN_GET && typeof operand !== "string") throw new Error("Invalid Yexp property operand");
    if (opcode === Opcode.CALL && (typeof operand !== "string" || !Number.isInteger(instruction[2]) || instruction[2] < 0)) {
      throw new Error("Invalid Yexp call operands");
    }
    if (opcode === Opcode.JUMP || opcode === Opcode.JUMP_IF_FALSE || opcode === Opcode.JUMP_IF_TRUE) {
      if (!Number.isInteger(operand) || operand < 0 || operand > program.code.length) throw new Error("Invalid Yexp jump target");
    }
  }
  // Lambda constants contain their own bytecode programs, including nested lambdas.
  function validateConstants(item: unknown): void {
    if (Array.isArray(item)) { item.forEach(validateConstants); return; }
    if (item && typeof item === "object") {
      const object = record(item);
      if (object.__lambda === true) {
        if (!Array.isArray(object.params) || !object.params.every(param => typeof param === "string")) {
          throw new Error("Invalid Yexp lambda parameters");
        }
        validateProgram(object.program);
      } else { Object.values(object).forEach(validateConstants); }
    }
  }
  program.constants.forEach(validateConstants);
}

/** Load trusted compiler output without compiling its optional source. */
export function loadYexpExpression(value: unknown): CompiledYexpExpression {
  assertPortableJson(value);
  const artifact = record(value);
  if (artifact.engine !== "yexp" || artifact.artifactVersion !== 1) {
    throw new Error("Unsupported Yexp expression artifact");
  }
  if (artifact.source !== undefined && typeof artifact.source !== "string") throw new Error("Invalid Yexp source");
  validateProgram(artifact.program);
  // Own the loaded object so later changes to the supplied JSON cannot alter execution.
  return JSON.parse(JSON.stringify(artifact)) as {
    engine: "yexp"; artifactVersion: 1; source?: string; program: BytecodeProgram;
  };
}
