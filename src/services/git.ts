import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { logger } from "../logger.js";

const GIT_URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*\.git$/;
const GIT_TIMEOUT_MS = 120_000;

export interface CloneResult {
  success: boolean;
  path: string;
  error?: string;
}

export function validateGitUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Git URL is required");

  // Block command injection — only allow safe URL patterns
  if (/[;&|`$(){}[\]<>!\\]/.test(trimmed)) {
    throw new Error("Git URL contains invalid characters");
  }

  // Accept github.com, gitlab.com, bitbucket.org URLs
  if (!/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w.\-]+\/[\w.\-]+(\.git)?$/.test(trimmed)) {
    throw new Error("Git URL must be an https:// URL from github.com, gitlab.com, or bitbucket.org");
  }

  return trimmed;
}

export function repoNameFromUrl(url: string): string {
  const base = basename(url.trim(), ".git");
  return base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

export async function cloneRepo(url: string, targetPath: string, onOutput?: (chunk: string) => void): Promise<CloneResult> {
  const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  if (existsSync(targetPath)) {
    return { success: false, path: targetPath, error: `Directory already exists: ${targetPath}` };
  }

  logger.info(`Cloning ${url} → ${targetPath}`);

  return new Promise((resolve) => {
    const proc = spawn("git", ["clone", "--depth", "1", url, targetPath], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: GIT_TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      onOutput?.(chunk);
    });

    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
      onOutput?.(d.toString());
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
    }, GIT_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        logger.info(`Clone complete: ${targetPath}`);
        resolve({ success: true, path: targetPath });
      } else {
        logger.error(`Clone failed (exit ${code}): ${stderr}`);
        resolve({ success: false, path: targetPath, error: stderr || stdout || `Exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      logger.error(`Clone error: ${err.message}`);
      resolve({ success: false, path: targetPath, error: err.message });
    });
  });
}
