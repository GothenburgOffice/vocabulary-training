"use client";
import { useState } from "react";
import type { ModelList, Tier } from "../../lib/admin/ai-settings";
import { adminRequest } from "./request";

// Loads Requesty's model list with a tier's stored key, or with a key typed but not saved.
export function useModels() {
  const [models, setModels] = useState<ModelList | null>(null);
  const [status, setStatus] = useState("");
  async function load(source: { tier: Tier } | { apiKey: string }) {
    setStatus("Loading models…");
    try {
      const list = await adminRequest<ModelList>("/api/admin/models", "POST", source);
      setModels(list);
      setStatus(`${list.chat.length} chat and ${list.speech.length} speech models.`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return { models, status, load };
}
