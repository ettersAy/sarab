import { Router } from "express";
import type { SettingsStore } from "../storage/settings.js";
import type { AIProvider } from "../queue/types.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { v4 as uuid } from "uuid";

export function createSettingsRouter(settingsStore: SettingsStore): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(settingsStore.load());
  });

  router.put("/", (req, res) => {
    const body = req.body;
    // Validate defaultProviderId is in providers
    if (body.providers && Array.isArray(body.providers) && body.providers.length > 0) {
      if (body.defaultProviderId && !body.providers.find((p: any) => p.id === body.defaultProviderId)) {
        throw new ValidationError(`defaultProviderId '${body.defaultProviderId}' not found in providers`);
      }
    }
    settingsStore.save(body);
    res.json(settingsStore.load());
  });

  router.get("/providers", (_req, res) => {
    const settings = settingsStore.load();
    res.json(settings.providers);
  });

  router.post("/providers", (req, res) => {
    const { name, type, apiKeyEnvVar, defaultModel, enabled, isDefault, baseUrl, claudeCmd, claudeFlags } = req.body;
    if (!name || !type || !apiKeyEnvVar || !defaultModel) {
      throw new ValidationError("name, type, apiKeyEnvVar, and defaultModel are required");
    }
    const settings = settingsStore.load();
    if (settings.providers.some((p) => p.name === name)) {
      throw new ValidationError(`Provider '${name}' already exists`);
    }
    const provider: AIProvider = {
      id: uuid().slice(0, 8),
      name,
      type,
      apiKeyEnvVar,
      defaultModel,
      enabled: enabled ?? true,
      isDefault: isDefault ?? false,
      baseUrl,
      claudeCmd,
      claudeFlags,
    };
    if (provider.isDefault) {
      settings.providers.forEach((p) => (p.isDefault = false));
    }
    if (settings.providers.length === 0) provider.isDefault = true;
    settings.providers.push(provider);
    settingsStore.save(settings);
    res.status(201).json(provider);
  });

  router.put("/providers/:id", (req, res) => {
    const settings = settingsStore.load();
    const idx = settings.providers.findIndex((p) => p.id === req.params.id);
    if (idx === -1) throw new NotFoundError("Provider", req.params.id);
    const patch = req.body;
    if (patch.isDefault) {
      settings.providers.forEach((p) => (p.isDefault = false));
    }
    settings.providers[idx] = { ...settings.providers[idx], ...patch };
    settingsStore.save(settings);
    res.json(settings.providers[idx]);
  });

  router.delete("/providers/:id", (req, res) => {
    const settings = settingsStore.load();
    const provider = settings.providers.find((p) => p.id === req.params.id);
    if (!provider) throw new NotFoundError("Provider", req.params.id);
    if (provider.isDefault) {
      throw new ValidationError("Cannot delete the default provider");
    }
    settings.providers = settings.providers.filter((p) => p.id !== req.params.id);
    settingsStore.save(settings);
    res.json({ deleted: true });
  });

  router.post("/providers/:id/default", (req, res) => {
    const settings = settingsStore.load();
    const provider = settings.providers.find((p) => p.id === req.params.id);
    if (!provider) throw new NotFoundError("Provider", req.params.id);
    settings.providers.forEach((p) => (p.isDefault = false));
    provider.isDefault = true;
    settings.defaultProviderId = provider.id;
    settingsStore.save(settings);
    res.json(provider);
  });

  return router;
}
