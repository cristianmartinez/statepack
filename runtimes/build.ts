import { resolve } from "node:path";
const root=resolve(import.meta.dir,"..");
const commands:[string,string[],string][]=[
  ["javascript",["bun","run","build"],root],
  ["rust",[process.env.CARGO??"cargo","build","--manifest-path","runtimes/rust/Cargo.toml"],root],
  ["go",[process.env.GO??"go","build","-o","statepack-go","./cmd/statepack"],resolve(root,"runtimes/go")],
  ["zig",["sh","runtimes/zig/build.sh"],root],
];
for(const [name,command,cwd] of commands){
  const child=Bun.spawn(command,{cwd,env:process.env,stdout:"inherit",stderr:"inherit"});
  if(await child.exited!==0) throw new Error(`${name} runtime build failed`);
  console.log(`${name} runtime built`);
}
