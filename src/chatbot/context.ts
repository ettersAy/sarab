import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger.js";

export interface ContextFile {
  path: string;
  content: string;
  size: number;
  error?: string;
}

export interface ContextResult {
  files: ContextFile[];
  totalSize: number;
  truncated: boolean;
}

const MAX_CONTEXT_SIZE = 100_000; // 100KB limit
const MAX_FILE_SIZE = 50_000; // 50KB per file

export function loadContextFiles(rootPath: string, fileList: string[]): ContextResult {
  const result: ContextResult = { files: [], totalSize: 0, truncated: false };

  for (const filePath of fileList) {
    const fullPath = join(rootPath, filePath);

    // Safety: prevent path traversal
    if (fullPath.includes("..") || !fullPath.startsWith(rootPath)) {
      result.files.push({ path: filePath, content: "", size: 0, error: "Path traversal blocked" });
      continue;
    }

    if (!existsSync(fullPath)) {
      result.files.push({ path: filePath, content: "", size: 0, error: "File not found" });
      continue;
    }

    try {
      const stats = statSync(fullPath);
      if (stats.size > MAX_FILE_SIZE) {
        result.files.push({ path: filePath, content: "", size: stats.size, error: `File too large (${stats.size} > ${MAX_FILE_SIZE})` });
        continue;
      }

      if (result.totalSize + stats.size > MAX_CONTEXT_SIZE) {
        result.truncated = true;
        break;
      }

      const content = readFileSync(fullPath, "utf-8");
      result.files.push({ path: filePath, content, size: stats.size });
      result.totalSize += stats.size;
    } catch (err) {
      logger.warn(`Failed to read context file ${fullPath}: ${String(err)}`);
      result.files.push({ path: filePath, content: "", size: 0, error: String(err) });
    }
  }

  return result;
}

export function buildChatPrompt(
  question: string,
  context: ContextResult,
  projectName: string,
  systemPrompt?: string,
): string {
  const base = systemPrompt?.trim() ||
    "You are a helpful AI assistant answering questions about the project. Use the provided project context files to give accurate, specific answers. Be concise and direct.";

  let prompt = `${base}\n\n`;
  prompt += `Project: ${projectName}\n\n`;

  if (context.files.length > 0) {
    prompt += "## Project Context\n\n";
    for (const file of context.files) {
      if (file.error) {
        prompt += `### ${file.path}\n[Error: ${file.error}]\n\n`;
      } else {
        prompt += `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
    }
    if (context.truncated) {
      prompt += "[Some context files were omitted due to size limits]\n\n";
    }
  }

  prompt += `## Question\n${question}\n\n`;
  prompt += "Provide a clear, helpful answer based on the project context above.";

  return prompt;
}
