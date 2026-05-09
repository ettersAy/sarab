export type JobStatus = "pending" | "running" | "retrying" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  title: string;
  prompt: string;
  model?: string;
  status: JobStatus;
  timeoutMs: number;
  maxRetries: number;
  attempt: number;
  exitCode: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  logFile: string | null;
  tags: string[];
}

export interface JobCreateInput {
  title: string;
  prompt: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  tags?: string[];
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}
