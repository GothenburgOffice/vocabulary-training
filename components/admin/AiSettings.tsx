"use client";
import { useEffect, useState } from "react";
import type { AiSettingsView, Tier } from "../../lib/admin/ai-settings";
import { adminRequest } from "./request";
import { useModels } from "./useModels";

const TIER_TEXT: Record<Tier, { title: string; help: string }> = {
  basic: { title: "Basic", help: "Used by every account." },
  plus: {
    title: "Plus",
    help: "For accounts with ai_tier = plus. Blank settings use the basic value.",
  },
};

export default function AiSettings() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    adminRequest<AiSettingsView>("/api/admin/ai")
      .then(setView)
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error && !view) return <p className="error">{error}</p>;
  if (!view) return <p>Loading…</p>;
  return (
    <>
      {!view.encryptionReady && (
        <p className="error" role="alert">
          SETTINGS_ENCRYPTION_KEY is missing or invalid, so API keys can&apos;t be saved or read.
          Set it in .env to 32 random bytes in base64 (for example{" "}
          <code>openssl rand -base64 32</code>) and restart.
        </p>
      )}
      <div className="admin-grid">
        {(["basic", "plus"] as const).map((tier) => (
          <TierCard key={tier} tier={tier} view={view} onSaved={setView} />
        ))}
      </div>
    </>
  );
}

function TierCard({
  tier,
  view,
  onSaved,
}: {
  tier: Tier;
  view: AiSettingsView;
  onSaved: (view: AiSettingsView) => void;
}) {
  const current = view.tiers[tier];
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(current.model);
  const [status, setStatus] = useState("");
  const models = useModels();
  const listId = `chat-models-${tier}`;

  async function save(update: { apiKey?: string | null; model?: string }) {
    setStatus("Saving…");
    try {
      onSaved(await adminRequest<AiSettingsView>("/api/admin/ai", "PUT", { tier, ...update }));
      setApiKey("");
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  const keyText =
    current.key.state === "set"
      ? `Saved, ending in …${current.key.hint}`
      : current.key.state === "unreadable"
        ? "Saved, but it can't be decrypted with the current SETTINGS_ENCRYPTION_KEY. Enter it again."
        : tier === "plus"
          ? "Not set: plus accounts use the basic key."
          : "Not set: AI features are off.";

  return (
    <section className="admin-card">
      <h2>{TIER_TEXT[tier].title}</h2>
      <p className="field-help">{TIER_TEXT[tier].help}</p>
      <label className="field">
        Requesty API key
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={current.key.state === "set" ? "Enter a new key to replace it" : "rqsty-sk-…"}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <small>{keyText}</small>
      </label>
      <div className="admin-actions">
        <button
          className="button primary"
          disabled={!apiKey.trim()}
          onClick={() => void save({ apiKey })}
        >
          Save key
        </button>
        {current.key.state !== "unset" && (
          <button className="button" onClick={() => void save({ apiKey: null })}>
            Remove key
          </button>
        )}
      </div>
      <label className="field">
        Language-note model
        <input
          list={listId}
          value={model}
          placeholder={tier === "plus" ? "Blank: use the basic model" : "Blank: language notes off"}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id={listId}>
          {models.models?.chat.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <small>A chat model or a Requesty policy such as policy/name.</small>
      </label>
      <div className="admin-actions">
        <button className="button primary" onClick={() => void save({ model: model.trim() })}>
          Save model
        </button>
        <button
          className="button"
          disabled={!apiKey.trim() && current.key.state !== "set"}
          onClick={() => void models.load(apiKey.trim() ? { apiKey: apiKey.trim() } : { tier })}
        >
          Load models
        </button>
      </div>
      {(status || models.status) && (
        <p className="admin-status" role="status">
          {status || models.status}
        </p>
      )}
    </section>
  );
}
