export interface ExecutorInput {
  prompt: string;
  model?: string;
  timeoutMs: number;        // 0 = no hard deadline (run indefinitely)
  idleTimeoutMs: number;    // 0 = no idle timeout; >0 = kill if no output for this many ms
  sessionId?: string;
  cwd?: string;
  onOutput?: (chunk: string) => void;
  onHeartbeat?: () => void; // Called each time stdout produces output (resets idle timer)
}

export interface ExecutorOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;        // Hard timeout fired
  idleTimedOut: boolean;    // Idle timeout fired (no output for idleTimeoutMs)
  capturedSessionId?: string;
  killed?: boolean;
}

export interface Executor {
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
  kill?(): void;
}
