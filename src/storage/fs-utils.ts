import { existsSync, mkdirSync, readdirSync, rmdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ValidationError } from "../errors.js";

const PROJECTS_ROOT = "/srv/dev/sarab/projects";

export function getProjectsRoot(): string {
  if (!existsSync(PROJECTS_ROOT)) {
    mkdirSync(PROJECTS_ROOT, { recursive: true });
  }
  return PROJECTS_ROOT;
}

export function projectDir(name: string): string {
  return join(getProjectsRoot(), slugify(name));
}

export function ticketsDir(projectName: string): string {
  const dir = join(projectDir(projectName), "tickets", "backlog");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function promptsDir(projectName: string): string {
  const dir = join(projectDir(projectName), "prompts");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Project name is required");
  if (/\.\./.test(trimmed) || /[\/\\]/.test(trimmed)) {
    throw new ValidationError("Project name contains invalid characters");
  }
  return trimmed;
}

export function safeFilename(title: string, maxLen: number = 100): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  if (!base) return "untitled";
  return base;
}

export function safeFilenameWithId(title: string, id: string): string {
  return `${safeFilename(title)}-${id}.md`;
}

export function scanProjectDirs(): { name: string; slug: string; path: string }[] {
  const root = getProjectsRoot();
  const entries = readdirSync(root);
  const projects: { name: string; slug: string; path: string }[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry);
    if (!statSync(fullPath).isDirectory()) continue;
    const metaPath = join(fullPath, "project.json");
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
        projects.push({ name: meta.name, slug: entry, path: fullPath });
      } catch {
        // Skip malformed project directories
      }
    }
  }
  return projects;
}

export function writeProjectMeta(slug: string, meta: Record<string, unknown>): void {
  const dir = join(getProjectsRoot(), slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.json"), JSON.stringify(meta, null, 2));
}

export function readProjectMeta(slug: string): Record<string, unknown> | null {
  const metaPath = join(getProjectsRoot(), slug, "project.json");
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

export function deleteProjectDir(slug: string): void {
  const dir = join(getProjectsRoot(), slug);
  if (existsSync(dir)) {
    rmRecursive(dir);
  }
}

export function findProjectNameById(projectId: string): string | null {
  const root = getProjectsRoot();
  try {
    for (const entry of readdirSync(root)) {
      const meta = readProjectMeta(entry);
      if (meta?.id === projectId) {
        return meta.name as string;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function rmRecursive(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      rmRecursive(full);
    } else {
      unlinkSync(full);
    }
  }
  rmdirSync(dir);
}
