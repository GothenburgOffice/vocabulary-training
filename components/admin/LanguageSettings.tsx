"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, CircleAlert } from "lucide-react";
import type { LanguageView, ModelList, Speech, Tier } from "../../lib/admin/ai-settings";
import {
  BULK_FIELDS,
  changedLanguages,
  sameLanguage,
  withField,
  type BulkField,
} from "../../lib/admin/language-table";
import { voicesFor } from "../../lib/admin/voices";
import { adminRequest } from "./request";
import { useModels } from "./useModels";

type Languages = { languages: LanguageView[] };

// One row per language, edited in place like a spreadsheet (#73). Edits wait for Save changes;
// rows can be ticked to set one field on all of them at once.
export default function LanguageSettings() {
  const [languages, setLanguages] = useState<LanguageView[] | null>(null);
  // Edited rows by name, until saved or discarded.
  const [drafts, setDrafts] = useState<Record<string, LanguageView>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const basicModels = useModels();
  const plusModels = useModels();
  useEffect(() => {
    adminRequest<Languages>("/api/admin/languages")
      .then((r) => setLanguages(r.languages))
      .catch((e: Error) => setError(e.message));
  }, []);
  const changed = languages ? changedLanguages(languages, drafts) : [];
  // Leaving the page with unsaved rows asks first.
  useEffect(() => {
    if (!changed.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length]);

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
  function edit(next: LanguageView) {
    setDrafts((d) => ({ ...d, [next.name]: next }));
    setStatus("");
  }
  // Saves the changed rows one by one; a row that fails keeps its edits and shows why.
  async function save() {
    setSaving(true);
    setStatus("Saving…");
    const failed: Record<string, string> = {};
    for (const language of changed) {
      try {
        const result = await adminRequest<Languages>("/api/admin/languages", "PUT", language);
        setLanguages(result.languages);
        setDrafts((d) => {
          const rest = { ...d };
          delete rest[language.name];
          return rest;
        });
      } catch (e) {
        failed[language.name] = (e as Error).message;
      }
    }
    setErrors(failed);
    const count = Object.keys(failed).length;
    setStatus(count ? `${count} not saved.` : "Saved.");
    setSaving(false);
  }
  function discard() {
    setDrafts({});
    setErrors({});
    setStatus("");
  }
  function move(index: number, by: number) {
    if (!languages) return;
    const order = languages.map((l) => l.name);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    void send("PATCH", { order });
  }
  function toggle(name: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!languages) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const rows = languages.map((l) => drafts[l.name] ?? l);
  const allSelected = selected.size === languages.length;
  // Voice suggestions for every model in use.
  const models = [...new Set(rows.flatMap((l) => [l.speech.model, l.plusSpeech.model]))];
  return (
    <>
      <div className="lang-toolbar">
        <button
          className="button primary"
          disabled={!changed.length || saving}
          onClick={() => void save()}
        >
          Save changes{changed.length ? ` (${changed.length})` : ""}
        </button>
        <button className="button" disabled={!changed.length || saving} onClick={discard}>
          Discard
        </button>
        <button
          className="button"
          onClick={() => {
            void basicModels.load({ tier: "basic" });
            void plusModels.load({ tier: "plus" });
          }}
        >
          Load model suggestions
        </button>
        <span className="admin-status" role="status">
          {[status, basicModels.status, plusModels.status].filter(Boolean).join(" ")}
        </span>
      </div>
      {selected.size > 0 && (
        <BulkEdit
          count={selected.size}
          onApply={(field, value) => {
            for (const l of rows) if (selected.has(l.name)) edit(withField(l, field, value));
          }}
          onClear={() => setSelected(new Set())}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <ul className="error lang-errors" role="alert">
          {Object.entries(errors).map(([name, message]) => (
            <li key={name}>
              {name}: {message}
            </li>
          ))}
        </ul>
      )}
      <ModelOptions id="speech-models-basic" models={basicModels.models} />
      <ModelOptions id="speech-models-plus" models={plusModels.models} />
      {models.map((model) => (
        <datalist key={model} id={voiceListId(model)}>
          {voicesFor(model).voices.map((voice) => (
            <option key={voice} value={voice} />
          ))}
        </datalist>
      ))}
      <div className="lang-table-wrap">
        <table className="lang-table">
          <thead>
            <tr>
              <th rowSpan={2} className="lang-select">
                <input
                  type="checkbox"
                  aria-label="Select all languages"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(languages.map((l) => l.name)))
                  }
                />
              </th>
              <th rowSpan={2} className="lang-name">
                Language
              </th>
              <th rowSpan={2}>Code</th>
              <th rowSpan={2}>Hidden</th>
              <th colSpan={3}>Speech</th>
              <th colSpan={3}>Plus speech (blank: basic)</th>
              <th rowSpan={2}>Order</th>
            </tr>
            <tr>
              <th>Model</th>
              <th>Voice</th>
              <th>Instructions</th>
              <th>Model</th>
              <th>Voice</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((language, index) => {
              const server = languages[index];
              const dirty = !sameLanguage(language, server);
              return (
                <tr
                  key={language.name}
                  className={[
                    dirty ? "is-changed" : "",
                    language.hidden ? "is-hidden" : "",
                    errors[language.name] ? "is-failed" : "",
                  ].join(" ")}
                >
                  <td className="lang-select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${language.name}`}
                      checked={selected.has(language.name)}
                      onChange={() => toggle(language.name)}
                    />
                  </td>
                  <th scope="row" className="lang-name">
                    {language.name}
                    {errors[language.name] && (
                      <CircleAlert size={14} aria-label={errors[language.name]} />
                    )}
                  </th>
                  <td>
                    <input
                      className="lang-code"
                      aria-label={`${language.name} code`}
                      value={language.code}
                      placeholder="sv"
                      onChange={(e) => edit({ ...language, code: e.target.value })}
                    />
                  </td>
                  <td className="lang-center">
                    <input
                      type="checkbox"
                      aria-label={`${language.name} hidden`}
                      checked={language.hidden}
                      onChange={(e) => edit({ ...language, hidden: e.target.checked })}
                    />
                  </td>
                  <SpeechCells
                    language={language.name}
                    tier="basic"
                    value={language.speech}
                    onChange={(speech) => edit({ ...language, speech })}
                  />
                  <SpeechCells
                    language={language.name}
                    tier="plus"
                    value={language.plusSpeech}
                    onChange={(plusSpeech) => edit({ ...language, plusSpeech })}
                  />
                  <td className="lang-order">
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${language.name} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === languages.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${language.name} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <AddLanguage onAdd={(name, code) => send("POST", { name, code })} />
          </tfoot>
        </table>
      </div>
      <p className="field-help">
        &quot;Other&quot; is always offered last and has no speech. Languages can&apos;t be deleted
        or renamed because saved lists use them; hide one instead. Moving a language saves at once;
        other edits wait for Save changes.
      </p>
    </>
  );
}

const voiceListId = (model: string) => `voices-${model.replace(/[^a-z0-9]/gi, "-")}`;

function ModelOptions({ id, models }: { id: string; models: ModelList | null }) {
  return (
    <datalist id={id}>
      {models?.speech.map((model) => (
        <option key={model} value={model} />
      ))}
    </datalist>
  );
}

function SpeechCells({
  language,
  tier,
  value,
  onChange,
}: {
  language: string;
  tier: Tier;
  value: Speech;
  onChange: (value: Speech) => void;
}) {
  const label = `${language} ${tier === "basic" ? "speech" : "plus speech"}`;
  const note = voicesFor(value.model).note;
  return (
    <>
      <td>
        <input
          className="lang-model"
          aria-label={`${label} model`}
          list={`speech-models-${tier}`}
          value={value.model}
          placeholder={tier === "plus" ? "basic" : "none"}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </td>
      <td>
        <input
          className="lang-voice"
          aria-label={`${label} voice`}
          list={voiceListId(value.model)}
          value={value.voice}
          disabled={!value.model}
          placeholder={value.model ? "default" : ""}
          title={note}
          onChange={(e) => onChange({ ...value, voice: e.target.value })}
        />
      </td>
      <td>
        <input
          className="lang-instructions"
          aria-label={`${label} instructions`}
          value={value.instructions}
          disabled={!value.model}
          title={value.instructions}
          onChange={(e) => onChange({ ...value, instructions: e.target.value })}
        />
      </td>
    </>
  );
}

// Sets one field on every ticked row; the rows still wait for Save changes.
function BulkEdit({
  count,
  onApply,
  onClear,
}: {
  count: number;
  onApply: (field: BulkField, value: string) => void;
  onClear: () => void;
}) {
  const [field, setField] = useState<BulkField>("speech.model");
  const [value, setValue] = useState("");
  const tier = field.startsWith("plusSpeech") ? "plus" : "basic";
  return (
    <form
      className="lang-bulk"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(field, field === "hidden" ? (value === "no" ? "no" : "yes") : value.trim());
      }}
    >
      <strong>{count} selected</strong>
      <label>
        Set
        <select
          aria-label="Field to set"
          value={field}
          onChange={(e) => {
            setField(e.target.value as BulkField);
            setValue(e.target.value === "hidden" ? "yes" : "");
          }}
        >
          {BULK_FIELDS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        to
        {field === "hidden" ? (
          <select aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="yes">Hidden</option>
            <option value="no">Shown</option>
          </select>
        ) : (
          <input
            aria-label="Value"
            value={value}
            list={field.endsWith(".model") ? `speech-models-${tier}` : undefined}
            placeholder="blank clears it"
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </label>
      <button className="button">Apply to {count}</button>
      <button type="button" className="text-button" onClick={onClear}>
        Clear selection
      </button>
    </form>
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
    <tr className="lang-add">
      <td />
      <th scope="row" className="lang-name">
        <form id="add-language" onSubmit={(e) => void submit(e)} />
        <input
          form="add-language"
          aria-label="New language"
          placeholder="Add a language"
          value={name}
          required
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </th>
      <td>
        <input
          form="add-language"
          className="lang-code"
          aria-label="New language code"
          placeholder="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </td>
      <td colSpan={8}>
        <button form="add-language" className="button" disabled={!name.trim()}>
          Add language
        </button>
      </td>
    </tr>
  );
}
