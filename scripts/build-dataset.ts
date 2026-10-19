/**
 * Full offline dataset build: capture, embed, project.
 * Flags are forwarded to the capture step (--attempts, --success, --concurrency, --catalog).
 */
import { spawn } from "node:child_process";

function run(script: string, extra: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", script, ...extra], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited ${code}`));
    });
  });
}

const forward = process.argv.slice(2);
await run("scripts/capture.ts", forward);
await new Promise<void>((resolve, reject) => {
  const child = spawn("npm", ["run", "build"], { stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
});
await run("scripts/embed.ts");
await run("scripts/project.ts");
