import { Router } from "express";
import type { TicketStore } from "../storage/tickets.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { TICKET_COLUMNS, TICKET_PRIORITIES } from "../queue/types.js";

export function createTicketsRouter(ticketStore: TicketStore): Router {
  const router = Router();

  router.get("/", (req, res) => {
    let tickets = ticketStore.list();
    if (req.query.projectId) {
      tickets = tickets.filter((t) => t.projectId === req.query.projectId);
    }
    if (req.query.column) {
      tickets = tickets.filter((t) => t.column === req.query.column);
    }
    if (req.query.parentId) {
      tickets = tickets.filter((t) => t.parentId === req.query.parentId);
    }
    tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(tickets);
  });

  router.post("/", (req, res) => {
    const { title, description, column, priority, projectId, parentId, tags } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      throw new ValidationError("Title is required");
    }
    if (column && !TICKET_COLUMNS.includes(column)) {
      throw new ValidationError(`Invalid column: ${column}`);
    }
    if (priority && !TICKET_PRIORITIES.includes(priority)) {
      throw new ValidationError(`Invalid priority: ${priority}`);
    }
    const ticket = ticketStore.create({
      title: title.trim(),
      description: description?.trim(),
      column,
      priority,
      projectId,
      parentId,
      tags,
    });
    res.status(201).json(ticket);
  });

  router.get("/:id", (req, res) => {
    const ticket = ticketStore.get(req.params.id);
    if (!ticket) throw new NotFoundError("Ticket", req.params.id);
    res.json(ticket);
  });

  router.patch("/:id", (req, res) => {
    const ticket = ticketStore.update(req.params.id, req.body);
    res.json(ticket);
  });

  router.delete("/:id", (req, res) => {
    ticketStore.delete(req.params.id);
    res.json({ deleted: true });
  });

  router.post("/:id/move", (req, res) => {
    const { column } = req.body;
    if (!column || !TICKET_COLUMNS.includes(column)) {
      throw new ValidationError(`Invalid column: ${column}`);
    }
    const ticket = ticketStore.moveToColumn(req.params.id, column);
    res.json(ticket);
  });

  router.get("/:id/subtickets", (req, res) => {
    const subs = ticketStore.getSubtickets(req.params.id);
    res.json(subs);
  });

  return router;
}
