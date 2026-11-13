"use client";
import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import type { LanguageView, Speech, Tier } from "@/lib/admin/ai-settings";
import {
  BULK_FIELDS,
  changedLanguages,
  isFlag,
  sameLanguage,
  sortLanguages,
  withField,
  type BulkField,
  type LanguageSort,
} from "@/lib/admin/language-table";
import type { Sort } from "@/lib/admin/sort";
import { voicesFor } from "@/lib/admin/voices";
import { adminRequest } from "./request";
import SortHeader from "./SortHeader";
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
  // The server's order (highlighted first, then by name) until a heading is clicked.
  const [sort, setSort] = useState<Sort<LanguageSort> | null>(null);
  const basicModels = useModels();
  const plusModels = useModels();
  // The model lists fill the model dropdowns; listing models calls no model. Without a key, a
  // tier's model cells stay plain text.
  const loadModels = useEffectEvent(() => {
    void basicModels.load({ tier: "basic" });
    void plusModels.load({ tier: "plus" });
  });
  useEffect(() => {
    adminRequest<Languages>("/api/admin/languages")
      .then((r) => {
        setLanguages(r.languages);
        loadModels();
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  const modelsFor = (tier: Tier) =>
    (tier === "basic" ? basicModels : plusModels).models?.speech ?? null;
  const changed = languages ? changedLanguages(languages, drafts) : [];
  // Leaving the page with unsaved rows asks first: closing or reloading the tab, and the admin
  // links (client-side navigation, which beforeunload doesn't see).
  useEffect(() => {
    if (!changed.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const confirmLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!link || link.getAttribute("href") === location.pathname) return;
      const count = changed.length;
      if (!confirm(`Leave without saving ${count} changed language${count === 1 ? "" : "s"}?`)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", confirmLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", confirmLink, true);
    };
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
        const revision = result.languages.find((l) => l.name === language.name)?.revision;
        setDrafts((d) => {
          const rest = { ...d };
          const draft = d[language.name];
          // Edited again while saving: keep the newer edits, now based on this save.
          if (draft && !sameLanguage(draft, language) && revision)
            rest[language.name] = { ...draft, revision };
          else delete rest[language.name];
          return rest;
        });
      } catch (e) {
        failed[language.name] = (e as Error).message;
      }
    }
    // After a failure, show the server's current rows; Discard then shows what changed there.
    if (Object.keys(failed).length)
      await adminRequest<Languages>("/api/admin/languages")
        .then((r) => setLanguages(r.languages))
        .catch(() => undefined);
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
  function toggle(name: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!languages) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const ordered = sortLanguages(languages, sort);
  const rows = ordered.map((l) => drafts[l.name] ?? l);
  const allSelected = selected.size === languages.length;
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
          Reload models
        </button>
        <span className="admin-status" role="status">
          {[
            status,
            basicModels.status && `Basic key: ${basicModels.status}`,
            plusModels.status && `Plus key: ${plusModels.status}`,
          ]
            .filter(Boolean)
            .join(" ")}
        </span>
      </div>
      {selected.size > 0 && (
        <BulkEdit
          count={selected.size}
          modelsFor={modelsFor}
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
      <div className="admin-table-wrap">
        <table className="admin-table lang-table">
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
              <SortHeader
                rowSpan={2}
                className="row-head lang-name"
                label="Language"
                sortKey="name"
                sort={sort}
                onSort={setSort}
              />
              <SortHeader rowSpan={2} label="Code" sortKey="code" sort={sort} onSort={setSort} />
              <SortHeader
                rowSpan={2}
                label="Highlighted"
                sortKey="highlighted"
                sort={sort}
                onSort={setSort}
                firstDir="desc"
              />
              <SortHeader
                rowSpan={2}
                label="Hidden"
                sortKey="hidden"
                sort={sort}
                onSort={setSort}
                firstDir="desc"
              />
              <th colSpan={3}>Speech</th>
              <th colSpan={3}>Plus speech (blank: basic)</th>
            </tr>
            <tr>
              {(["speech", "plusSpeech"] as const).flatMap((tier) =>
                (["model", "voice", "instructions"] as const).map((field) => (
                  <SortHeader
                    key={`${tier}.${field}`}
                    label={field[0].toUpperCase() + field.slice(1)}
                    sortKey={`${tier}.${field}` as const}
                    sort={sort}
                    onSort={setSort}
                  />
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((language, index) => {
              const server = ordered[index];
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
                  <th scope="row" className="row-head lang-name">
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
                      aria-label={`${language.name} highlighted`}
                      checked={language.highlighted}
                      onChange={(e) => edit({ ...language, highlighted: e.target.checked })}
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
                    models={modelsFor("basic")}
                    tier="basic"
                    value={language.speech}
                    onChange={(speech) => edit({ ...language, speech })}
                  />
                  <SpeechCells
                    language={language.name}
                    models={modelsFor("plus")}
                    tier="plus"
                    value={language.plusSpeech}
                    onChange={(plusSpeech) => edit({ ...language, plusSpeech })}
                  />
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
        Languages are listed highlighted first, then by name, here and in every picker.
        &quot;Other&quot; is always offered last and has no speech. Languages can&apos;t be deleted
        or renamed because saved lists use them; hide one instead.
      </p>
    </>
  );
}

// A cell's choice: a dropdown with every option (a typed-in list would only show the options
// matching what the cell already holds), or a text box when there is no list.
function ChoiceCell({
  options,
  groups = [],
  value,
  blank,
  label,
  className,
  disabled,
  title,
  onChange,
}: {
  options: string[] | null;
  // Options shown under a label (each also in `options`); the rest come first.
  groups?: { label: string; voices: string[] }[];
  value: string;
  // What an empty value means, shown as its option.
  blank: string;
  label: string;
  className: string;
  disabled?: boolean;
  title?: string;
  onChange: (value: string) => void;
}) {
  if (!options)
    return (
      <input
        className={className}
        aria-label={label}
        value={value}
        placeholder={disabled ? "" : blank}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <select
      className={className}
      aria-label={label}
      value={value}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{disabled ? "" : blank}</option>
      {value && !options.includes(value) && <option value={value}>{value} (not listed)</option>}
      {options
        .filter((option) => !groups.some((g) => g.voices.includes(option)))
        .map((option) => (
          <option key={option}>{option}</option>
        ))}
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.voices.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function SpeechCells({
  language,
  models,
  tier,
  value,
  onChange,
}: {
  language: string;
  // The tier key's speech models, or null when not loaded.
  models: string[] | null;
  tier: Tier;
  value: Speech;
  onChange: (value: Speech) => void;
}) {
  const label = `${language} ${tier === "basic" ? "speech" : "plus speech"}`;
  const voices = voicesFor(value.model);
  return (
    <>
      <td>
        <ChoiceCell
          className="lang-model"
          label={`${label} model`}
          options={models}
          value={value.model}
          blank={tier === "plus" ? "basic" : "none"}
          title={value.model}
          onChange={(model) => onChange({ ...value, model })}
        />
      </td>
      <td>
        <ChoiceCell
          className="lang-voice"
          label={`${label} voice`}
          options={voices.voices.length ? voices.voices : null}
          groups={voices.groups}
          value={value.voice}
          blank="default"
          disabled={!value.model}
          title={voices.note}
          onChange={(voice) => onChange({ ...value, voice })}
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
  modelsFor,
  onApply,
  onClear,
}: {
  count: number;
  modelsFor: (tier: Tier) => string[] | null;
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
        onApply(field, isFlag(field) ? (value === "no" ? "no" : "yes") : value.trim());
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
            setValue(isFlag(e.target.value as BulkField) ? "yes" : "");
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
        {isFlag(field) ? (
          <select aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="yes">{field === "hidden" ? "Hidden" : "Highlighted"}</option>
            <option value="no">{field === "hidden" ? "Shown" : "Not highlighted"}</option>
          </select>
        ) : (
          <ChoiceCell
            className="lang-bulk-value"
            label="Value"
            options={field.endsWith(".model") ? modelsFor(tier) : null}
            value={value}
            blank={
              field.endsWith(".model") ? (tier === "plus" ? "basic" : "none") : "blank clears it"
            }
            onChange={setValue}
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
      <th scope="row" className="row-head lang-name">
        <form id="add-language" onSubmit={(e) => void submit(e)} />
        <input
          form="add-language"
          aria-label="New language"
          placeholder="New language"
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
