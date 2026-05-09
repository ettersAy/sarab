import type { Executor, ExecutorInput, ExecutorOutput } from "./types.js";

export class DeepSeekExecutor implements Executor {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl?: string,
  ) {
    this.baseUrl = baseUrl || "https://api.deepseek.com/v1";
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    try {
      const fetchOpts: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model || "deepseek-chat",
          messages: [{ role: "user", content: input.prompt }],
          max_tokens: 4096,
        }),
      };
      if (input.timeoutMs > 0) {
        fetchOpts.signal = AbortSignal.timeout(input.timeoutMs);
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, fetchOpts);

      if (!res.ok) {
        const errText = await res.text();
        return { exitCode: 1, stdout: "", stderr: `DeepSeek API error ${res.status}: ${errText}`, timedOut: false, idleTimedOut: false };
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || "";
      return { exitCode: 0, stdout: content, stderr: "", timedOut: false, idleTimedOut: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const timedOut = msg.includes("aborted") || msg.includes("timeout");
      return { exitCode: timedOut ? 124 : 1, stdout: "", stderr: msg, timedOut, idleTimedOut: false };
    }
  }
}
