import { spawn } from "node:child_process";
import type { Executor, ExecutorInput, ExecutorOutput } from "./types.js";
import { logger } from "../logger.js";

export class ClaudeExecutor implements Executor {
  constructor(
    private readonly claudeCmd: string,
    private readonly claudeFlags: string,
  ) {}

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const args = [...this.claudeFlags.split(" ").filter(Boolean), "-p", input.prompt];
    if (input.model) args.unshift("--model", input.model);

    logger.debug(`Executing: ${this.claudeCmd} ${args.slice(0, -1).join(" ")} -p '...'`);

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const child = spawn(this.claudeCmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 10_000);
      }, input.timeoutMs);

      const finish = (exitCode: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: timedOut ? 124 : exitCode, stdout, stderr, timedOut });
      };

      child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("close", (code) => finish(code ?? 1));
      child.on("error", (err) => {
        stderr += err.message;
        finish(1);
      });
    });
  }
}
