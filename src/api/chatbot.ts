import { Router } from "express";
import type { ChatStore } from "../storage/chatbot.js";
import type { ProjectStore } from "../storage/projects.js";
import type { SettingsStore } from "../storage/settings.js";
import type { Executor } from "../executor/types.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { loadContextFiles, buildChatPrompt } from "../chatbot/context.js";

export function createChatbotRouter(
  chatStore: ChatStore,
  projectStore: ProjectStore,
  settingsStore: SettingsStore,
  executor: Executor,
): Router {
  const router = Router();

  // List conversations for a project
  router.get("/conversations", (req, res) => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw new ValidationError("projectId query param is required");
    res.json(chatStore.listConversations(projectId));
  });

  // Get messages for a conversation
  router.get("/conversations/:id/messages", (req, res) => {
    const conv = chatStore.getConversation(req.params.id);
    if (!conv) throw new NotFoundError("Conversation", req.params.id);
    res.json(chatStore.getMessages(req.params.id));
  });

  // Delete a conversation
  router.delete("/conversations/:id", (req, res) => {
    chatStore.deleteConversation(req.params.id);
    res.json({ deleted: true });
  });

  // Ask a question
  router.post("/ask", async (req, res, next) => {
    try {
      const { projectId, question, conversationId, model: requestedModel } = req.body;

      if (!projectId) throw new ValidationError("projectId is required");
      if (!question || typeof question !== "string" || question.trim().length === 0) {
        throw new ValidationError("question is required");
      }
      if (question.length > 4000) {
        throw new ValidationError("Question is too long (max 4000 chars)");
      }

      const project = projectStore.get(projectId);
      if (!project) throw new NotFoundError("Project", projectId);

      // Determine model
      const settings = settingsStore.load();
      const defaultProvider = settings.providers.find((p) => p.isDefault) ?? settings.providers[0];
      const model = requestedModel || project.settings?.defaultModel || defaultProvider?.defaultModel || "claude-sonnet-4-6";

      // Load context files from project settings
      const contextFiles = project.settings?.contextFiles || [];
      const ctx = loadContextFiles(project.rootPath, contextFiles);

      // Build the full prompt
      const systemPrompt = project.settings?.templates?.reflection || undefined;
      const fullPrompt = buildChatPrompt(question.trim(), ctx, project.name, systemPrompt);

      // Get or create conversation
      let convId = conversationId;
      if (!convId) {
        const title = question.trim().slice(0, 80) + (question.length > 80 ? "..." : "");
        const conv = chatStore.createConversation(projectId, title, model);
        convId = conv.id;
      } else {
        const conv = chatStore.getConversation(convId);
        if (!conv) throw new NotFoundError("Conversation", convId);
      }

      // Store user message
      chatStore.addMessage({
        conversationId: convId,
        role: "user",
        content: question.trim(),
        contextFiles: contextFiles,
        model,
        error: null,
      });

      // Execute AI call
      const output = await executor.execute({
        prompt: fullPrompt,
        model,
        timeoutMs: 60_000,
        idleTimeoutMs: 0,
      });

      if (output.exitCode !== 0) {
        const errMsg = output.stderr || `Exit code ${output.exitCode}`;
        chatStore.addMessage({
          conversationId: convId,
          role: "assistant",
          content: "",
          contextFiles: [],
          model,
          error: errMsg,
        });
        chatStore.updateConversation(convId);
        throw new Error(`AI execution failed: ${errMsg}`);
      }

      const answer = output.stdout.trim();
      if (!answer) {
        chatStore.addMessage({
          conversationId: convId,
          role: "assistant",
          content: "",
          contextFiles: [],
          model,
          error: "Empty response from AI",
        });
        chatStore.updateConversation(convId);
        throw new Error("AI returned an empty response");
      }

      // Store assistant message
      const msg = chatStore.addMessage({
        conversationId: convId,
        role: "assistant",
        content: answer,
        contextFiles: ctx.files.filter((f) => !f.error).map((f) => f.path),
        model,
        error: null,
      });
      chatStore.updateConversation(convId);

      // Return answer with metadata
      res.json({
        conversationId: convId,
        message: msg,
        contextUsed: ctx.files.map((f) => ({ path: f.path, size: f.size, error: f.error })),
        totalContextSize: ctx.totalSize,
        truncated: ctx.truncated,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
