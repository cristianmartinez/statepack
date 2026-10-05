import { yexpEngine } from "../../packages/expressions/dist/index";
import { compileMachineArtifact, type Machine } from "../../packages/state-machine/src/index";
import { executeRequest } from "../javascript/index";

const cases: Array<{ name: string; request: unknown; expected: unknown }> = [];
async function expression(name: string, source: string, scope: unknown = {}, registry?: Record<string,string>) {
  const compiled = yexpEngine.compile(source);
  delete compiled.source;
  const request = { mode: "expression", expression: compiled, scope, ...(registry ? { registry } : {}) };
  cases.push({ name, request, expected: await executeRequest(request) });
}
async function machine(name: string, definition: Machine, events: unknown[], registry?: Record<string,string>) {
  const request = { mode: "machine", artifact: compileMachineArtifact(definition), events, ...(registry ? { registry } : {}) };
  cases.push({ name, request, expected: await executeRequest(request) });
}

for (const [name, source, scope] of [
  ["constant", "42", {}],
  ["scope-state-data", "$.state.value + $.data.amount", {state:{value:3},data:{amount:4}}],
  ["missing-null", "$.missing", {}],
  ["addition", "$.a + $.b", {a:2,b:3}],
  ["string-addition", "$.a + $.b", {a:"hello",b:" world"}],
  ["subtraction", "$.a - $.b", {a:8,b:3}],
  ["multiplication", "$.a * $.b", {a:3,b:4}],
  ["division", "$.a / $.b", {a:9,b:2}],
  ["remainder", "$.a % $.b", {a:-7,b:3}],
  ["negation", "-$.a", {a:7}],
  ["divide-zero", "1 / 0", {}],
  ["modulo-zero", "1 % 0", {}],
  ["wrong-arithmetic-type", "$.a + 1", {a:true}],
  ["equal-types", "$.a == $.b", {a:3,b:3}],
  ["unequal-types", "$.a == $.b", {a:3,b:"3"}],
  ["strict-not-equal", "$.a !== $.b", {a:2,b:3}],
  ["comparison", "$.a > $.b", {a:9,b:4}],
  ["string-comparison", "$.a < $.b", {a:"apple",b:"pear"}],
  ["fused-increment", "$.a + 1", {a:2}],
  ["fused-decrement", "$.a - 1", {a:2}],
  ["fused-add", "$.a + 8", {a:2}],
  ["fused-subtract", "$.a - 8", {a:12}],
  ["fused-multiply", "$.a * 8", {a:2}],
  ["fused-divide", "$.a / 8", {a:16}],
  ["fused-modulo", "$.a % 8", {a:10}],
  ["range", "$.a >= 2 && $.a < 5", {a:3}],
  ["range-false", "$.a > 2 && $.a <= 5", {a:2}],
  ["null-check", "$.a == null", {a:null}],
  ["nonnull-check", "$.a != null", {a:0}],
  ["truthiness-zero", "$.a && true", {a:0}],
  ["truthiness-empty-string", "$.a || 3", {a:""}],
  ["not", "!$.a", {a:false}],
  ["ternary", "$.a > 3 ? $.a * 2 : $.a * -1", {a:2}],
  ["null-coalesce", "$.missing ?? 7", {}],
  ["array-literal", "[$.a, $.a + 2, null]", {a:1}],
  ["object-literal", "{name: $.name, count: $.count}", {name:"Ada",count:2}],
  ["array-last", "$.items[-1]", {items:[1,2,3]}],
  ["dynamic-index", "$.items[$.index]", {items:[1,2,3],index:1}],
  ["array-length", "$.items.length", {items:[1,2,3]}],
  ["optional-property", "$.user?.name", {user:null}],
  ["optional-index", "$.items?.[0]", {items:null}],
  ["template", "`Hello ${$.name}, ${$.count}!`", {name:"Ada",count:2}],
  ["length-array", "length($.items)", {items:[1,2,3]}],
  ["length-utf16", "length($.text)", {text:"A😀B"}],
  ["abs", "abs(-4)", {}],
  ["floor", "floor(2.8)", {}],
  ["ceil", "ceil(-2.8)", {}],
  ["round-negative-tie", "round(-2.5)", {}],
  ["round-decimals", "round(1.234, 2)", {}],
  ["min", "min(3, 1, 2)", {}],
  ["max", "max(-3, -1, -2)", {}],
  ["string-array", "toString([1, null, [2,3]])", {}],
  ["host-function", "double($.value)", {value:7}],
] as const) {
  await expression(name, source, scope, name === "host-function" ? {double:"double"} : undefined);
}
for (const op of [">",">=","<","<=","==","!=","===","!=="]) await expression(`fused-${op}`, `$.a ${op} 3`, {a:2});
await expression("override-default", "abs(3)", {}, {abs:"double"});
await expression("unknown-function", "unknownFunction(1)");

const counter: Machine = {id:"counter",expressionEngine:"yexp",initial:"active",store:{counter:{context:{count:0},queries:{doubled:"$.context.count * 2"},mutations:{increment:{count:"$.context.count + $.event.amount"}}}},states:{active:{on:{INCREMENT:{actions:[{type:"mutation",name:"increment"}]}}}}};
await machine("counter", counter, [{type:"INCREMENT",amount:3},{type:"INCREMENT",amount:4}]);
await machine("registered-mutation", {...counter,store:{counter:{context:{count:1},queries:{doubled:"double($.context.count)"},mutations:{increment:{count:"double($.context.count + $.event.amount)"}}}}}, [{type:"INCREMENT",amount:2}], {double:"double"});
await machine("entry-exit-effects", {id:"flow",expressionEngine:"yexp",initial:"idle",actions:{report:{type:"log",message:"$.event.value + 1"}},states:{idle:{entry:{type:"log",message:'"start"'},exit:{type:"log",message:'"exit"'},on:{GO:[{guard:{condition:{type:"compare",op:">",left:{type:"ref",path:"event.value"},right:0}},target:"done",actions:["report",{type:"host.event",name:'"complete"',data:{value:"$.event.value"}}]}]}},done:{type:"final",entry:{type:"log",message:'"done"'}}}},[{type:"GO",value:-1},{type:"GO",value:3}]);
await machine("global-transition", {id:"global",expressionEngine:"yexp",initial:"idle",on:{FINISH:"done"},states:{idle:{},done:{type:"final"}}},[{type:"FINISH"}]);
await machine("always-transition", {id:"always",expressionEngine:"yexp",initial:"idle",states:{idle:{always:[{target:"done"}]},done:{type:"final"}}},[]);
await machine("simultaneous-mutation", {id:"swap",expressionEngine:"yexp",initial:"active",store:{data:{context:{a:1,b:2},mutations:{swap:{a:"$.context.b",b:"$.context.a"}}}},states:{active:{on:{SWAP:{actions:[{type:"mutation",name:"swap"}]}}}}},[{type:"SWAP"}]);

// Portable-profile failures tested identically by all native implementations.
const unknownVersion = {mode:"expression",expression:{engine:"yexp",artifactVersion:1,program:{version:999,slots:[],constants:[],code:[[200]]}},scope:{}};
cases.push({name:"bad-bytecode-version",request:unknownVersion,expected:{error:{code:"INVALID_ARTIFACT"}}});
const unsupported = {mode:"expression",expression:{engine:"yexp",artifactVersion:1,program:{version:1,slots:[],constants:[],code:[[112],[200]]}},scope:{}};
cases.push({name:"unsupported-opcode",request:unsupported,expected:{error:{code:"UNSUPPORTED_FEATURE"}}});
const malformed = {mode:"expression",expression:{engine:"yexp",artifactVersion:1,program:{version:1,slots:[],constants:[],code:[[0,100],[200]]}},scope:{}};
cases.push({name:"invalid-constant-reference",request:malformed,expected:{error:{code:"INVALID_INSTRUCTION"}}});

await expression("length-object-error", "length({a: 1})");
await expression("round-decimals-error", 'round(1.2, "bad")');
await expression("min-empty-error", "min()");
await expression("max-empty-error", "max()");
await expression("length-error", "length(3)");
await expression("abs-error", 'abs("3")');
await expression("host-function-error", 'double("bad")', {}, {double:"double"});
await expression("surrogate-index-error", "$.text[0]", {text:"😀"});
// The native profile rejects surrogate results rather than substituting characters.
cases[cases.length-1]!.expected = {error:{code:"UNSUPPORTED_FEATURE"}};
await expression("ascii-string-index", "$.text[1]", {text:"abc"});
await expression("guard-primitive-boolean", "$.a == false", {a:false});
const versionArtifact = compileMachineArtifact(counter);
cases.push({name:"bad-machine-version",request:{mode:"machine",artifact:{...versionArtifact,version:99},events:[]},expected:{error:{code:"INVALID_ARTIFACT"}}});
const nestedArtifact = compileMachineArtifact({id:"nested",expressionEngine:"yexp",initial:"outer",states:{outer:{initial:"inner",states:{inner:{}}}}});
cases.push({name:"unsupported-nested-state",request:{mode:"machine",artifact:nestedArtifact,events:[]},expected:{error:{code:"UNSUPPORTED_FEATURE"}}});
const missingSlice = {...versionArtifact,slices:[]};
cases.push({name:"missing-slice",request:{mode:"machine",artifact:missingSlice,events:[]},expected:{error:{code:"INVALID_ARTIFACT"}}});
const duplicateSlice = {...versionArtifact,slices:[...versionArtifact.slices,...versionArtifact.slices]};
cases.push({name:"duplicate-slice",request:{mode:"machine",artifact:duplicateSlice,events:[]},expected:{error:{code:"INVALID_ARTIFACT"}}});
const queryCycle = compileMachineArtifact({...counter,store:{counter:{context:{count:0},queries:{a:"$.queries.b",b:"$.queries.a"}}}});
// Keep state actions valid, otherwise a missing mutation would mask the cycle.
queryCycle.definition.states = {active:{}};
cases.push({name:"query-cycle",request:{mode:"machine",artifact:queryCycle,events:[]},expected:{error:{code:"INVALID_ARTIFACT"}}});

await expression("abs-extra-arg-error", "abs(1,2)");
await expression("toString-no-arg-error", "toString()");
await expression("round-extra-arg-error", "round(1,2,3)");
await expression("toString-small-number", "toString(0.0000001)");
await expression("toString-large-number", "toString(1000000000000000000000)");
await expression("nonfinite-host-output", "double($.value)", {value:1e308}, {double:"double"});
await expression("unsupported-lambda", "$.items.map(item => item * 2)", {items:[1,2]});
await machine("named-guard", {id:"guard",expressionEngine:"yexp",initial:"idle",guards:{allowed:{condition:{type:"compare",op:"===",left:{type:"ref",path:"event.allowed"},right:true}}},states:{idle:{on:{GO:[{guard:"allowed",target:"done"}]}},done:{type:"final"}}},[{type:"GO",allowed:false},{type:"GO",allowed:true}]);
await machine("multiple-slices", {id:"slices",expressionEngine:"yexp",initial:"active",store:{one:{context:{count:1},mutations:{add:{count:"$.context.count + 1"}}},two:{context:{count:10},mutations:{add:{count:"$.context.count + 2"}}}},states:{active:{on:{GO:{actions:[{type:"mutation",name:"one.add"},{type:"mutation",name:"two.add"}]}}}}},[{type:"GO"}]);
await machine("internal-transition", {id:"internal",expressionEngine:"yexp",initial:"one",states:{one:{exit:{type:"log",message:'"exit"'},on:{GO:{target:"two",internal:true}}},two:{entry:{type:"log",message:'"entry"'}}}},[{type:"GO"}]);
await machine("guard-truthiness-zero", {id:"zero",expressionEngine:"yexp",initial:"idle",guards:{allowed:{condition:"event.value"}},states:{idle:{on:{GO:[{guard:"allowed",target:"done"}]}},done:{type:"final"}}},[{type:"GO",value:0}]);
await machine("guard-loose-equality", {id:"coerce",expressionEngine:"yexp",initial:"idle",guards:{allowed:{condition:{type:"compare",op:"==",left:{type:"ref",path:"event.value"},right:3}}},states:{idle:{on:{GO:[{guard:"allowed",target:"done"}]}},done:{type:"final"}}},[{type:"GO",value:"3"}]);

await machine("initial-final", {id:"final",expressionEngine:"yexp",initial:"done",states:{done:{type:"final"}}},[]);
await machine("final-is-terminal", {id:"terminal",expressionEngine:"yexp",initial:"idle",on:{RESET:"idle"},states:{idle:{on:{FINISH:"done"}},done:{type:"final"}}},[{type:"FINISH"},{type:"RESET"}]);
await machine("initial-final-always-terminal", {id:"terminal-always",expressionEngine:"yexp",initial:"done",states:{done:{type:"final",always:[{target:"active"}]},active:{}}},[]);
await machine("guard-ordered-scalar-coercion", {id:"ordered",expressionEngine:"yexp",initial:"idle",states:{idle:{on:{GO:{target:"done",guard:{condition:{type:"compare",op:">",left:{type:"ref",path:"event.amount"},right:"2"}}}}},done:{type:"final"}}},[{type:"GO",amount:3}]);
await machine("slice-flatten-order", {id:"flatten",expressionEngine:"yexp",initial:"idle",store:{z:{context:{count:1},queries:{shared:"7"}},a:{context:{count:10,shared:2}}},states:{idle:{on:{GO:{actions:[{type:"log",message:"$.context.count"},{type:"log",message:"$.context.shared"}]}}}}},[{type:"GO"}]);
for (const [name, mutate, code] of [
  ["unsupported-slice-sources", (a:any)=>{a.definition.store.counter.sources={};}, "UNSUPPORTED_FEATURE"],
  ["unsupported-conditional-action", (a:any)=>{a.definition.states.active.entry={type:"log",message:"literal",condition:"false"};}, "UNSUPPORTED_FEATURE"],
  ["invalid-on-table", (a:any)=>{a.definition.states.active.on=[];}, "INVALID_ARTIFACT"],
  ["unsupported-unused-action", (a:any)=>{a.definition.actions={unused:{type:"assign",values:{count:"1"}}};}, "UNSUPPORTED_FEATURE"],
] as const) {
  const artifact=compileMachineArtifact(counter); mutate(artifact);
  cases.push({name,request:{mode:"machine",artifact,events:[]},expected:{error:{code}}});
}
await Bun.write(new URL("./cases.json", import.meta.url), JSON.stringify(cases, null, 2)+"\n");
console.log(`Generated ${cases.length} conformance cases`);
