"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { LanguageView, ModelList, Speech, Tier } from "../../lib/admin/ai-settings";
import { voicesFor } from "../../lib/admin/voices";
import { adminRequest } from "./request";
import { useModels } from "./useModels";

type Languages = { languages: LanguageView[] };

export default function LanguageSettings() {
  const [languages, setLanguages] = useState<LanguageView[] | null>(null);
  const [error, setError] = useState("");
  const basicModels = useModels();
  const plusModels = useModels();
  useEffect(() => {
    adminRequest<Languages>("/api/admin/languages")
      .then((r) => setLanguages(r.languages))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function send(method: string, data: unknown) {
    setError("");
    try {
      setLanguages((await adminRequest<Languages>("/api/admin/languages", method, data)).languages);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  function move(index: number, by: number) {
    if (!languages) return;
    const order = languages.map((l) => l.name);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    void send("PATCH", { order });
  }

  if (!languages) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  return (
    <>
      <div className="admin-actions">
        <button className="button" onClick={() => void basicModels.load({ tier: "basic" })}>
          Load speech models (basic key)
        </button>
        <button className="button" onClick={() => void plusModels.load({ tier: "plus" })}>
          Load speech models (plus key)
        </button>
      </div>
      {(basicModels.status || plusModels.status) && (
        <p className="admin-status" role="status">
          {[basicModels.status, plusModels.status].filter(Boolean).join(" ")}
        </p>
      )}
      <ModelOptions id="speech-models-basic" models={basicModels.models} />
      <ModelOptions id="speech-models-plus" models={plusModels.models} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="admin-languages">
        {languages.map((language, index) => (
          <li key={language.name}>
            <LanguageCard
              language={language}
              onSave={(update) => send("PUT", update)}
              onUp={index > 0 ? () => move(index, -1) : undefined}
              onDown={index < languages.length - 1 ? () => move(index, 1) : undefined}
            />
          </li>
        ))}
      </ul>
      <AddLanguage onAdd={(name, code) => send("POST", { name, code })} />
      <p className="field-help">
        &quot;Other&quot; is always offered last and has no speech. Languages can&apos;t be deleted
        or renamed because saved lists use them; hide one instead.
      </p>
    </>
  );
}

function ModelOptions({ id, models }: { id: string; models: ModelList | null }) {
  return (
    <datalist id={id}>
      {models?.speech.map((model) => (
        <option key={model} value={model} />
      ))}
    </datalist>
  );
}

function LanguageCard({
  language,
  onSave,
  onUp,
  onDown,
}: {
  language: LanguageView;
  onSave: (language: LanguageView) => Promise<boolean>;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const [draft, setDraft] = useState(language);
  const [status, setStatus] = useState("");
  // The draft is saved against the revision last loaded here, which moves on after each save.
  const edited = { ...draft, revision: language.revision };
  const changed = JSON.stringify(edited) !== JSON.stringify(language);
  async function save() {
    setStatus("Saving…");
    setStatus((await onSave(edited)) ? "Saved." : "");
  }
  return (
    <section className={`admin-card admin-language${language.hidden ? " is-hidden" : ""}`}>
      <header>
        <h2>{language.name}</h2>
        <div className="admin-actions">
          <button className="text-button" disabled={!onUp} onClick={onUp} aria-label="Move up">
            <ArrowUp size={15} />
          </button>
          <button
            className="text-button"
            disabled={!onDown}
            onClick={onDown}
            aria-label="Move down"
          >
            <ArrowDown size={15} />
          </button>
        </div>
      </header>
      <div className="admin-row">
        <label className="field">
          CSV code
          <input
            value={draft.code}
            placeholder="e.g. sv"
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={draft.hidden}
            onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })}
          />
          Hidden from new choices
        </label>
      </div>
      <div className="admin-grid">
        <SpeechFields
          tier="basic"
          value={draft.speech}
          onChange={(speech) => setDraft({ ...draft, speech })}
        />
        <SpeechFields
          tier="plus"
          value={draft.plusSpeech}
          onChange={(plusSpeech) => setDraft({ ...draft, plusSpeech })}
        />
      </div>
      <div className="admin-actions">
        <button className="button primary" disabled={!changed} onClick={() => void save()}>
          Save {language.name}
        </button>
        {status && <span className="admin-status">{status}</span>}
      </div>
    </section>
  );
}

function SpeechFields({
  tier,
  value,
  onChange,
}: {
  tier: Tier;
  value: Speech;
  onChange: (value: Speech) => void;
}) {
  const voices = voicesFor(value.model);
  const voiceList = `voices-${tier}-${value.model}`;
  return (
    <fieldset className="admin-speech">
      <legend>{tier === "basic" ? "Speech" : "Plus speech"}</legend>
      <label className="field">
        Model
        <input
          list={`speech-models-${tier}`}
          value={value.model}
          placeholder={tier === "plus" ? "Blank: use the basic speech" : "Blank: no speech"}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </label>
      <label className="field">
        Voice
        <input
          list={voiceList}
          value={value.voice}
          disabled={!value.model}
          placeholder="Blank: the model's default"
          onChange={(e) => onChange({ ...value, voice: e.target.value })}
        />
        <datalist id={voiceList}>
          {voices.voices.map((voice) => (
            <option key={voice} value={voice} />
          ))}
        </datalist>
        {voices.note && <small>{voices.note}</small>}
      </label>
      <label className="field">
        Instructions
        <textarea
          rows={2}
          value={value.instructions}
          disabled={!value.model}
          placeholder="Blank: none. Only some models accept instructions."
          onChange={(e) => onChange({ ...value, instructions: e.target.value })}
        />
      </label>
    </fieldset>
  );
}

function AddLanguage({ onAdd }: { onAdd: (name: string, code: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd(name, code)) {
      setName("");
      setCode("");
    }
  }
  return (
    <form className="admin-card admin-row" onSubmit={(e) => void submit(e)}>
      <label className="field">
        New language
        <input value={name} required maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        CSV code
        <input value={code} placeholder="optional" onChange={(e) => setCode(e.target.value)} />
      </label>
      <button className="button primary" disabled={!name.trim()}>
        Add language
      </button>
    </form>
  );
}
