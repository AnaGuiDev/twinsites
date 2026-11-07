// Operator tool. Credentials are read only from the environment, never from arguments.
import { readFile } from "node:fs/promises";
const endpoint = process.env.SERVICES_ENDPOINT;
const token = process.env.SERVICES_ADMIN_TOKEN;
if (!endpoint || !token) throw new Error("Set SERVICES_ENDPOINT and SERVICES_ADMIN_TOKEN in your shell environment.");
const url = new URL("/services/admin", endpoint);
if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("HTTPS required");
const file = process.argv[2];
const body = file ? await readFile(file, "utf8") : undefined;
if (body) JSON.parse(body);
const result = await fetch(url, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body, signal: AbortSignal.timeout(20000) });
if (!result.ok) throw new Error(`Studio returned ${result.status}: ${await result.text()}`);
process.stdout.write(`${JSON.stringify(await result.json(), null, 2)}\n`);
