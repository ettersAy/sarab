import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Project, ProjectCreateInput } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError, ValidationError } from "../errors.js";

export class ProjectStore {
  private filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "projects.jsonl");
  }

  list(): Project[] {
    if (!existsSync(this.filePath)) return [];
    const raw = readFileSync(this.filePath, "utf-8").trim();
    if (!raw) return [];
    return raw.split("\n").map((line) => JSON.parse(line) as Project);
  }

  get(id: string): Project | undefined {
    return this.list().find((p) => p.id === id);
  }

  create(input: ProjectCreateInput): Project {
    if (!input.name || typeof input.name !== "string" || input.name.trim().length === 0) {
      throw new ValidationError("Project name is required");
    }
    if (!input.rootPath || typeof input.rootPath !== "string" || input.rootPath.trim().length === 0) {
      throw new ValidationError("Root path is required");
    }
    if (!existsSync(input.rootPath) || !statSync(input.rootPath).isDirectory()) {
      throw new ValidationError(`Root path does not exist or is not a directory: ${input.rootPath}`);
    }

    const existing = this.list().find((p) => p.name === input.name.trim());
    if (existing) throw new ValidationError(`Project '${input.name}' already exists`);

    const now = new Date().toISOString();
    const project: Project = {
      id: uuid().slice(0, 8),
      name: input.name.trim(),
      rootPath: input.rootPath.trim(),
      createdAt: now,
      updatedAt: now,
      settings: input.settings,
    };
    this.append(project);
    logger.info(`Project created: ${project.id} — "${project.name}"`);
    return project;
  }

  update(id: string, patch: Partial<Pick<Project, "name" | "rootPath">>): Project {
    const projects = this.list();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) throw new NotFoundError("Project", id);

    if (patch.rootPath !== undefined) {
      if (!existsSync(patch.rootPath) || !statSync(patch.rootPath).isDirectory()) {
        throw new ValidationError(`Root path does not exist: ${patch.rootPath}`);
      }
    }

    projects[idx] = { ...projects[idx], ...patch, updatedAt: new Date().toISOString() };
    this.writeAll(projects);
    return projects[idx];
  }

  delete(id: string): void {
    const projects = this.list().filter((p) => p.id !== id);
    this.writeAll(projects);
  }

  private append(project: Project): void {
    const line = JSON.stringify(project) + "\n";
    writeFileSync(this.filePath, line, { flag: "a" });
  }

  private writeAll(projects: Project[]): void {
    const content = projects.map((p) => JSON.stringify(p)).join("\n") + (projects.length ? "\n" : "");
    const tmp = `${this.filePath}.${uuid().slice(0, 8)}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.filePath);
  }
}
