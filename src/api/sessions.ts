import { Router } from "express";
import type { SessionStore } from "../storage/sessions.js";
import { NotFoundError } from "../errors.js";

export function createSessionsRouter(sessionStore: SessionStore): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const sessions = projectId
      ? sessionStore.listForProject(projectId)
      : sessionStore.list();
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(sessions);
  });

  router.get("/latest", (req, res) => {
    const projectId = (req.query.projectId as string) || null;
    const session = sessionStore.getLatestForProject(projectId);
    if (!session) throw new NotFoundError("Session", `latest for project ${projectId ?? "global"}`);
    res.json(session);
  });

  router.get("/:id", (req, res) => {
    const session = sessionStore.get(req.params.id);
    if (!session) throw new NotFoundError("Session", req.params.id);
    res.json(session);
  });

  return router;
}
