export interface ExecutorInput {
  prompt: string;
  model?: string;
  timeoutMs: number;
}

export interface ExecutorOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface Executor {
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
}
