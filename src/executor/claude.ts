import { spawn, type ChildProcess } from "node:child_process";
import type { Executor, ExecutorInput, ExecutorOutput } from "./types.js";
import { logger } from "../logger.js";

const SESSION_ID_RE = /Session ID: (cls_\w+)/;

export class ClaudeExecutor implements Executor {
  private currentProcess: ChildProcess | null = null;
  private killed = false;

  constructor(
    private readonly claudeCmd: string,
    private readonly claudeFlags: string,
  ) {}

  kill(): void {
    this.killed = true;
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill("SIGTERM");
      setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill("SIGKILL");
        }
      }, 10_000);
    }
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    this.killed = false;
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
      let idleTimedOut = false;
      let settled = false;
      let hardTimer: ReturnType<typeof setTimeout> | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      this.currentProcess = spawn(this.claudeCmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        cwd: input.cwd,
      });

      // Hard timeout — only if timeoutMs > 0
      if (input.timeoutMs > 0) {
        hardTimer = setTimeout(() => {
          timedOut = true;
          logger.warn(`Hard timeout (${input.timeoutMs}ms) reached, killing...`);
          this.currentProcess?.kill("SIGTERM");
          setTimeout(() => {
            if (this.currentProcess && !this.currentProcess.killed) {
              this.currentProcess.kill("SIGKILL");
            }
          }, 10_000);
        }, input.timeoutMs);
      }

      // Idle timeout — kill if no output for idleTimeoutMs
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (input.idleTimeoutMs > 0) {
          idleTimer = setTimeout(() => {
            idleTimedOut = true;
            logger.warn(`Idle timeout (${input.idleTimeoutMs}ms) — no output, killing...`);
            this.currentProcess?.kill("SIGTERM");
            setTimeout(() => {
              if (this.currentProcess && !this.currentProcess.killed) {
                this.currentProcess.kill("SIGKILL");
              }
            }, 10_000);
          }, input.idleTimeoutMs);
        }
      };

      // Start idle timer — process must produce output to stay alive
      resetIdleTimer();

      const finish = (exitCode: number) => {
        if (settled) return;
        settled = true;
        if (hardTimer) clearTimeout(hardTimer);
        if (idleTimer) clearTimeout(idleTimer);
        this.currentProcess = null;
        resolve({
          exitCode: timedOut ? 124 : idleTimedOut ? 125 : this.killed ? 143 : exitCode,
          stdout,
          stderr,
          timedOut,
          idleTimedOut,
          capturedSessionId,
          killed: this.killed,
        });
      };

      this.currentProcess.stdout?.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stdout += chunk;
        input.onOutput?.(chunk);
        input.onHeartbeat?.();
        resetIdleTimer(); // Activity = reset idle clock
      });
      this.currentProcess.stderr?.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        if (!capturedSessionId) {
          const match = chunk.match(SESSION_ID_RE);
          if (match) capturedSessionId = match[1];
        }
      });
      this.currentProcess.on("close", (code) => finish(code ?? 1));
      this.currentProcess.on("error", (err) => {
        stderr += err.message;
        finish(1);
      });
    });
  }
}
