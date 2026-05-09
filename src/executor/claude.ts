import { spawn } from "node:child_process";
import type { Executor, ExecutorInput, ExecutorOutput } from "./types.js";
import { logger } from "../logger.js";

const SESSION_ID_RE = /Session ID: (cls_\w+)/;

export class ClaudeExecutor implements Executor {
  constructor(
    private readonly claudeCmd: string,
    private readonly claudeFlags: string,
  ) {}

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const args = [...this.claudeFlags.split(" ").filter(Boolean)];
    if (input.model) args.unshift("--model", input.model);
    if (input.sessionId) args.push("--resume", input.sessionId);
    args.push("-p", input.prompt);

    const masked = args.includes("--resume")
      ? args.slice(0, -3).join(" ")
      : args.slice(0, -1).join(" ");
    logger.debug(`Executing: ${this.claudeCmd} ${masked} -p '...'`);

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let capturedSessionId: string | undefined;
      let timedOut = false;
      let settled = false;

      const child = spawn(this.claudeCmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        cwd: input.cwd,
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
        resolve({ exitCode: timedOut ? 124 : exitCode, stdout, stderr, timedOut, capturedSessionId });
      };

      child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        if (!capturedSessionId) {
          const match = chunk.match(SESSION_ID_RE);
          if (match) capturedSessionId = match[1];
        }
      });
      child.on("close", (code) => finish(code ?? 1));
      child.on("error", (err) => {
        stderr += err.message;
        finish(1);
      });
    });
  }
}
