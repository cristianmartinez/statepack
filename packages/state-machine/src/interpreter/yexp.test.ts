import { expect, test } from "bun:test";
import { compileMachine } from "../compiler";
import { interpretWithSignals } from "./interpreter";

test("Yexp machine executes mutations and reactive queries", async () => {
  const machine = {
    id: "counter", expressionEngine: "yexp" as const, initial: "active",
    store: { counter: {
      context: { count: 0 },
      queries: { doubled: "$.context.count * 2" },
      mutations: { increment: { count: "$.context.count + $.event.amount" } },
    } },
    states: { active: { on: { INCREMENT: { actions: [{ type: "mutation" as const, name: "increment" }] } } } },
  };
  const compiled = compileMachine(JSON.parse(JSON.stringify(machine)));
  const interpreter = interpretWithSignals(compiled);
  try {
    await interpreter.start();
    await interpreter.send({ type: "INCREMENT", amount: 3 });
    expect(interpreter.getSliceContext("counter").count).toBe(3);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(interpreter.getSignalScope("counter").queries?.doubled?.value).toBe(6);
  } finally { interpreter.stop(); }
});

test("Yexp rejects malformed store expressions during compilation", () => {
  expect(() => compileMachine({
    id: "bad", expressionEngine: "yexp", initial: "active",
    store: { counter: { queries: { bad: "$.context." } } }, states: { active: {} },
  })).toThrow();
});


test("Yexp resolves action expressions through the machine cache", async () => {
  const effects: unknown[] = [];
  const interpreter = interpretWithSignals({
    id: "effects", expressionEngine: "yexp", initial: "active",
    states: { active: { on: { GREET: {
      actions: [{ type: "log", message: "$.event.name + \"!\"" }],
    } } } },
  }, { execute: async effect => { effects.push(effect); } });
  try {
    await interpreter.start();
    await interpreter.send({ type: "GREET", name: "Ada" });
    expect(effects).toEqual([{ type: "log", params: {
      type: "log", message: "Ada!",
    } }]);
  } finally { interpreter.stop(); }
});

import { createPrimitiveRegistry } from "@statepack/expressions";
import { compileMachineArtifact, loadMachineArtifact } from "../compiler/artifact";

test("loaded machines use host functions in queries, mutations, and effects", async () => {
  const artifact = compileMachineArtifact({
    id:"registry",expressionEngine:"yexp",initial:"active",
    store:{counter:{context:{count:1},queries:{doubled:"double($.context.count)"},mutations:{increment:{count:"double($.context.count + 1)"}}}},
    states:{active:{on:{GO:{actions:[{type:"mutation",name:"increment"},{type:"log",message:"double($.event.amount)"}]}}}},
  });
  const effects:unknown[]=[];
  const functions=createPrimitiveRegistry().register("double",([value])=>Number(value)*2);
  const runtime=interpretWithSignals(loadMachineArtifact(artifact),{expressionFunctions:functions,execute:async effect=>{effects.push(effect);}});
  try {
    await runtime.start(); await new Promise(resolve=>setTimeout(resolve,0));
    await runtime.send({type:"GO",amount:3}); await new Promise(resolve=>setTimeout(resolve,0));
    expect(runtime.getSliceContext("counter")).toEqual({count:4});
    expect(runtime.getSignalScope("counter")?.queries?.doubled?.value).toBe(8);
    expect(effects).toEqual([{type:"log",params:{type:"log",message:6}}]);
  } finally {runtime.stop();}
});


test("mutations keep slice ownership when context keys overlap", async () => {
  const runtime = interpretWithSignals({
    id:"ownership",expressionEngine:"yexp",initial:"active",
    store:{one:{context:{count:1},mutations:{add:{count:"$.context.count + 1"}}},two:{context:{count:10},mutations:{add:{count:"$.context.count + 2"}}}},
    states:{active:{on:{GO:{actions:[{type:"mutation",name:"one.add"},{type:"mutation",name:"two.add"}]}}}},
  });
  try { await runtime.start(); await runtime.send("GO");
    expect(runtime.getSliceContext("one")).toEqual({count:2});
    expect(runtime.getSliceContext("two")).toEqual({count:12});
  } finally {runtime.stop();}
});


test("final machines are done initially and ignore subsequent external events", async () => {
  const runtime = interpretWithSignals({id:"terminal",initial:"done",on:{RESET:"idle"},states:{idle:{},done:{type:"final"}}});
  try {
    await runtime.start(); expect(runtime.done.value).toBe(true);
    await runtime.send("RESET"); expect(runtime.state.value).toBe("done");
  } finally {runtime.stop();}
});


test("initial final states do not take always transitions", async () => {
  const runtime = interpretWithSignals({id:"terminal-always",initial:"done",states:{done:{type:"final",always:[{target:"active"}]},active:{}}});
  try { await runtime.start(); expect(runtime.state.value).toBe("done"); expect(runtime.done.value).toBe(true); }
  finally { runtime.stop(); }
});
