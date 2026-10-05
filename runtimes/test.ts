import { resolve } from "node:path";
const root=resolve(import.meta.dir,"..");
for(const [command,cwd] of [
  [[process.env.CARGO??"cargo","test","--manifest-path","runtimes/rust/Cargo.toml"],root],
  [[process.env.GO??"go","test","./..."],resolve(root,"runtimes/go")],
  [["sh","runtimes/zig/test.sh"],root],
] as [string[],string][]){
 const child=Bun.spawn(command,{cwd,env:process.env,stdout:"inherit",stderr:"inherit"});
 if(await child.exited!==0) throw new Error(`Native tests failed: ${command[0]}`);
}
const conformance=Bun.spawn(["bun","runtimes/conformance/run.ts"],{cwd:root,env:process.env,stdout:"inherit",stderr:"inherit"});
if(await conformance.exited!==0) throw new Error("Cross-runtime conformance failed");
