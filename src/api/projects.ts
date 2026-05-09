import { Router } from "express";
import type { ProjectStore } from "../storage/projects.js";
import type { JobStore } from "../storage/jobs.js";
import type { SessionStore } from "../storage/sessions.js";
import { NotFoundError } from "../errors.js";

export function createProjectsRouter(
  projectStore: ProjectStore,
  jobStore: JobStore,
  sessionStore: SessionStore,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const projects = projectStore.list();
    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(projects);
  });

  router.post("/", async (req, res, next) => {
    try {
      const project = await projectStore.create(req.body);
      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", (req, res) => {
    const project = projectStore.get(req.params.id);
    if (!project) throw new NotFoundError("Project", req.params.id);
    res.json(project);
  });

  router.put("/:id", (req, res) => {
    const project = projectStore.update(req.params.id, req.body);
    res.json(project);
  });

  router.delete("/:id", (req, res) => {
    projectStore.delete(req.params.id);
    res.json({ deleted: true });
  });

  router.get("/:id/jobs", (req, res) => {
    const jobs = jobStore.list().filter((j) => j.projectId === req.params.id);
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(jobs);
  });

  router.get("/:id/sessions", (req, res) => {
    const sessions = sessionStore.listForProject(req.params.id);
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(sessions);
  });

  return router;
}
