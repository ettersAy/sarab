import { Router } from "express";
import type { Executor } from "../executor/types.js";
import { ValidationError, AppError } from "../errors.js";

const ACTIONS = ["reformulate", "improve", "correct", "shorten", "expand"] as const;

const SYSTEM_PROMPTS: Record<string, string> = {
  reformulate: "Reformulate the following prompt to be clearer, more structured, and easier to understand. Keep all key requirements but improve readability. Output ONLY the reformulated prompt, no explanations.",
  improve: "Improve the following prompt by adding specificity, context, and structure. Make it more effective for an AI assistant. Output ONLY the improved prompt, no explanations.",
  correct: "Fix any grammar, spelling, punctuation, or clarity issues in the following prompt. Preserve the original intent and all requirements. Output ONLY the corrected prompt, no explanations.",
  shorten: "Condense the following prompt to be as short as possible while preserving all key instructions, constraints, and requirements. Output ONLY the shortened prompt, no explanations.",
  expand: "Expand the following prompt with more detail, context, structure, and explicit instructions to make it more effective for an AI assistant. Output ONLY the expanded prompt, no explanations.",
};

export function createPromptRouter(executor: Executor): Router {
  const router = Router();

  router.post("/improve", async (req, res, next) => {
    try {
      const { prompt, action } = req.body;

      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        throw new ValidationError("Prompt is required");
      }
      if (!action || !ACTIONS.includes(action)) {
        throw new ValidationError(`Action must be one of: ${ACTIONS.join(", ")}`);
      }

      const metaPrompt = `${SYSTEM_PROMPTS[action]}\n\n---\n${prompt.trim()}`;

      const output = await executor.execute({
        prompt: metaPrompt,
        timeoutMs: 30_000,
      });

      if (output.exitCode !== 0) {
        throw new AppError(
          `Claude exited with code ${output.exitCode}: ${output.stderr}`,
          "CLAUDE_EXECUTION_ERROR",
          502,
        );
      }

      const result = output.stdout.trim();
      if (!result) {
        throw new AppError("Claude returned an empty response", "EMPTY_RESPONSE", 502);
      }

      res.json({ result, action, original: prompt.trim() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
