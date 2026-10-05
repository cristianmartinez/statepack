import { resolve } from "node:path";
import cases from "./cases.json";
import profile from "../profile.json";

const root = resolve(import.meta.dir, "../..");
const binaries: Record<string, string[]> = {
  javascript: ["bun", resolve(root,"runtimes/javascript/cli.ts")],
  rust: [process.env.STATEPACK_RUST_BIN ?? resolve(root,"runtimes/rust/target/debug/statepack-runtime")],
  go: [process.env.STATEPACK_GO_BIN ?? resolve(root,"runtimes/go/statepack-go")],
  zig: [process.env.STATEPACK_ZIG_BIN ?? resolve(root,"runtimes/zig/zig-out/bin/statepack-zig")],
};
const selected = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(binaries);
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => JSON.stringify(key)+":"+canonical(value[key])).join(",")}}`;
  return JSON.stringify(value);
}
async function call(command: string[], request: unknown): Promise<any> {
  const process = Bun.spawn(command, {cwd: root,stdin:"pipe",stdout:"pipe",stderr:"pipe"});
  process.stdin.write(JSON.stringify(request)); process.stdin.end();
  const timeout = setTimeout(() => process.kill(), 10000);
  try {
    const [output,errors,exit] = await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
    if (exit !== 0) throw new Error(`Process exited ${exit}: ${errors}`);
    return JSON.parse(output);
  } finally { clearTimeout(timeout); }
}
let failures = 0;
for (const name of names) {
  const command = binaries[name];
  if (!command) throw new Error(`Unknown runtime ${name}`);
  const capabilities = await call(command,{mode:"capabilities"});
  const opcodes = [...(capabilities.supportedOpcodes ?? [])].sort((a,b)=>a-b);
  const functions = [...(capabilities.functions ?? [])].sort();
  if (canonical(opcodes) !== canonical([...profile.supportedOpcodes].sort((a,b)=>a-b)) ||
      canonical(functions) !== canonical([...profile.functions].sort())) {
    console.error(`${name}: capabilities differ from shared profile`,JSON.stringify(capabilities)); failures++;
  }
  let passed = 0;
  for (const test of cases) {
    const actual = await call(command,test.request);
    const expected = test.expected as any;
    const matches = expected.error ? actual.error?.code === expected.error.code : canonical(actual) === canonical(expected);
    if (matches) passed++;
    else { failures++; console.error(`${name}/${test.name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
  }
  console.log(`${name}: ${passed}/${cases.length} conformance cases passed`);
}
if (failures) { console.error(`${failures} conformance failures`); process.exit(1); }
