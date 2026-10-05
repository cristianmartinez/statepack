import { executeRequest } from "./index";
const input = await Bun.stdin.text();
try { console.log(JSON.stringify(await executeRequest(JSON.parse(input)))); }
catch (error) { console.log(JSON.stringify({ error: { code: "INVALID_ARTIFACT", message: String(error) } })); }
