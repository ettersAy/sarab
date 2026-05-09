export type JobStatus = "pending" | "running" | "retrying" | "completed" | "failed" | "cancelled";
export type SessionMode = "new" | "resume" | "latest";

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
  projectId?: string;
  sessionId?: string;
  sessionMode?: SessionMode;
}

export interface JobCreateInput {
  title: string;
  prompt: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  tags?: string[];
  projectId?: string;
  sessionId?: string;
  sessionMode?: SessionMode;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface Session {
  id: string;
  sessionId: string;
  projectId: string | null;
  jobId: string;
  model: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateInput {
  name: string;
  rootPath: string;
}

export type ProviderType = "claude-cli" | "openai-compatible";

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  apiKeyEnvVar: string;
  defaultModel: string;
  enabled: boolean;
  isDefault: boolean;
  baseUrl?: string;
  claudeCmd?: string;
  claudeFlags?: string;
}

export interface AppSettings {
  providers: AIProvider[];
  defaultProviderId: string;
  executionDefaults: {
    timeoutMs: number;
    maxRetries: number;
  };
  promptImprovement: {
    providerId: string;
    model: string;
  };
}
