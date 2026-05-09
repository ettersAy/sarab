import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Project, ProjectCreateInput } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError, ValidationError } from "../errors.js";
import {
  getProjectsRoot,
  projectDir,
  slugify,
  validateProjectName,
  scanProjectDirs,
  writeProjectMeta,
  readProjectMeta,
  deleteProjectDir,
} from "./fs-utils.js";

export class ProjectStore {
  private projectsRoot: string;

  constructor(_dataDir: string) {
    this.projectsRoot = getProjectsRoot();
  }

  list(): Project[] {
    const dirs = scanProjectDirs();
    return dirs.map((d) => {
      const meta = readProjectMeta(d.slug);
      return metaToProject(d.slug, meta);
    }).filter((p): p is Project => p !== null);
  }

  get(id: string): Project | undefined {
    return this.list().find((p) => p.id === id);
  }

  create(input: ProjectCreateInput): Project {
    const name = validateProjectName(input.name);
    if (!input.rootPath || typeof input.rootPath !== "string" || input.rootPath.trim().length === 0) {
      throw new ValidationError("Root path is required");
    }
    if (!existsSync(input.rootPath) || !statSync(input.rootPath).isDirectory()) {
      throw new ValidationError(`Root path does not exist or is not a directory: ${input.rootPath}`);
    }

    const slug = slugify(name);
    if (!slug) throw new ValidationError("Project name must contain at least one letter or number");

    const dir = join(this.projectsRoot, slug);
    if (existsSync(dir)) {
      throw new ValidationError(`Project folder already exists: ${slug}`);
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: uuid().slice(0, 8),
      name,
      rootPath: input.rootPath.trim(),
      createdAt: now,
      updatedAt: now,
      settings: input.settings,
    };

    mkdirSync(dir, { recursive: true });
    writeProjectMeta(slug, project as unknown as Record<string, unknown>);
    logger.info(`Project created: ${project.id} — "${project.name}" (dir: ${slug})`);
    return project;
  }

  update(id: string, patch: Partial<Pick<Project, "name" | "rootPath" | "settings">>): Project {
    const project = this.get(id);
    if (!project) throw new NotFoundError("Project", id);

    if (patch.rootPath !== undefined) {
      if (patch.rootPath.trim().length === 0 || !existsSync(patch.rootPath)) {
        throw new ValidationError(`Root path does not exist: ${patch.rootPath}`);
      }
    }

    const oldSlug = slugify(project.name);
    const updated: Project = {
      ...project,
      ...patch,
      name: patch.name !== undefined ? validateProjectName(patch.name) : project.name,
      rootPath: patch.rootPath !== undefined ? patch.rootPath.trim() : project.rootPath,
      updatedAt: new Date().toISOString(),
    };

    const newSlug = slugify(updated.name);
    if (newSlug !== oldSlug) {
      if (existsSync(join(this.projectsRoot, newSlug))) {
        throw new ValidationError(`Project folder already exists: ${newSlug}`);
      }
      renameSync(join(this.projectsRoot, oldSlug), join(this.projectsRoot, newSlug));
    }

    writeProjectMeta(newSlug, updated as unknown as Record<string, unknown>);
    logger.info(`Project updated: ${id}` + (patch.name !== undefined ? ` → "${updated.name}"` : ""));
    return updated;
  }

  delete(id: string): void {
    const project = this.get(id);
    if (!project) throw new NotFoundError("Project", id);
    const slug = slugify(project.name);
    deleteProjectDir(slug);
    logger.info(`Project deleted: ${id} (dir: ${slug})`);
  }
}

function metaToProject(slug: string, meta: Record<string, unknown> | null): Project | null {
  if (!meta) return null;
  return {
    id: meta.id as string,
    name: meta.name as string,
    rootPath: meta.rootPath as string,
    createdAt: meta.createdAt as string,
    updatedAt: meta.updatedAt as string,
    settings: meta.settings as Project["settings"],
  };
}
