export interface ExecutorInput {
  prompt: string;
  model?: string;
  timeoutMs: number;
  sessionId?: string;
  cwd?: string;
}

export interface ExecutorOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  capturedSessionId?: string;
}

export interface Executor {
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
}
