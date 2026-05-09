export interface ExecutorInput {
  prompt: string;
  model?: string;
  timeoutMs: number;
  sessionId?: string;
  cwd?: string;
  onOutput?: (chunk: string) => void;
}

export interface ExecutorOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  capturedSessionId?: string;
  killed?: boolean;
}

export interface Executor {
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
  kill?(): void;
}
