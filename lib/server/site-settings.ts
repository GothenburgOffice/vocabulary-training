import "server-only";
import type { AiSettingsView, LanguageView, Speech, Tier } from "../admin/ai-settings";
import { registrationBlockers, type Privacy, type RegistrationView } from "../admin/registration";
import type { AiSettings, LanguageSettings } from "./ai-config";
import { db } from "./db";
import { decryptSecret, encryptionReady, encryptSecret } from "./secrets";

const keyName = (tier: Tier) => `requesty.${tier}.api_key`;
const modelName = (tier: Tier) => `requesty.${tier}.model`;
// Also seeded by scripts/settings-bootstrap.mjs.
const PRIVACY_NAME = "privacy.controller_name";
const PRIVACY_EMAIL = "privacy.contact_email";
const REGISTRATION_OPEN = "registration.open";

// Read on most requests, so cached briefly. Saves clear this process's cache at once; other
// processes pick changes up within CACHE_MS.
const CACHE_MS = 30_000;
let cache: { at: number; value: Promise<AiSettings> } | null = null;
export function invalidateAiSettings() {
  cache = null;
}
export function loadAiSettings(): Promise<AiSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = readAiSettings();
  cache = { at: Date.now(), value };
  value.catch(() => invalidateAiSettings());
  return value;
}

async function readSettingsMap() {
  const { rows } = await db.query("SELECT key,value FROM site_settings");
  return new Map<string, string>(rows.map((r) => [r.key, r.value]));
}
type LanguageRow = {
  name: string;
  code: string | null;
  hidden: boolean;
  speech_model: string;
  speech_voice: string;
  speech_instructions: string;
  plus_speech_model: string;
  plus_speech_voice: string;
  plus_speech_instructions: string;
  revision: string;
};
// updated_at in microseconds, as text: a language's revision for stale-save checks.
const revision = "(extract(epoch FROM updated_at)*1000000)::bigint::text";
async function readLanguageRows() {
  const { rows } = await db.query<LanguageRow>(
    `SELECT *, ${revision} AS revision FROM languages ORDER BY position, name`,
  );
  return rows;
}
async function readLanguages(): Promise<LanguageSettings[]> {
  return (await readLanguageRows()).map((r) => ({
    name: r.name,
    code: r.code ?? "",
    hidden: r.hidden,
    speech: { model: r.speech_model, voice: r.speech_voice, instructions: r.speech_instructions },
    plusSpeech: {
      model: r.plus_speech_model,
      voice: r.plus_speech_voice,
      instructions: r.plus_speech_instructions,
    },
  }));
}
async function readAiSettings(): Promise<AiSettings> {
  const [settings, languages] = await Promise.all([readSettingsMap(), readLanguages()]);
  const tier = (t: Tier) => {
    const stored = settings.get(keyName(t));
    return {
      apiKey: (stored && decryptSecret(stored)) || "",
      model: settings.get(modelName(t)) ?? "",
    };
  };
  return { basic: tier("basic"), plus: tier("plus"), languages };
}

// For the admin page: never the key itself, only whether it's set and its last characters.
export async function readAiSettingsView(): Promise<AiSettingsView> {
  const settings = await readSettingsMap();
  const view = (t: Tier) => {
    const stored = settings.get(keyName(t));
    const key = stored ? decryptSecret(stored) : null;
    return {
      model: settings.get(modelName(t)) ?? "",
      key: !stored
        ? { state: "unset" as const }
        : key
          ? { state: "set" as const, hint: key.slice(-4) }
          : { state: "unreadable" as const },
    };
  };
  return {
    encryptionReady: encryptionReady(),
    tiers: { basic: view("basic"), plus: view("plus") },
  };
}

// The key a tier's AI requests use, for loading its model list: plus falls back to the basic
// key like aiConfig does. Empty when neither is set and readable.
export async function storedApiKey(tier: Tier) {
  const settings = await readSettingsMap();
  const key = (t: Tier) => {
    const stored = settings.get(keyName(t));
    return (stored && decryptSecret(stored)) || "";
  };
  return (tier === "plus" && key("plus")) || key("basic");
}

async function setSetting(key: string, value: string) {
  if (value)
    await db.query(
      "INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2,updated_at=now()",
      [key, value],
    );
  else await db.query("DELETE FROM site_settings WHERE key=$1", [key]);
}
export async function saveTier(tier: Tier, update: { model?: string; apiKey?: string | null }) {
  if (update.apiKey) await setSetting(keyName(tier), encryptSecret(update.apiKey));
  else if (update.apiKey === null) await setSetting(keyName(tier), "");
  if (update.model !== undefined) await setSetting(modelName(tier), update.model);
  invalidateAiSettings();
}

export async function readLanguagesView(): Promise<LanguageView[]> {
  return (await readLanguageRows()).map((r) => ({
    name: r.name,
    revision: r.revision,
    code: r.code ?? "",
    hidden: r.hidden,
    speech: { model: r.speech_model, voice: r.speech_voice, instructions: r.speech_instructions },
    plusSpeech: {
      model: r.plus_speech_model,
      voice: r.plus_speech_voice,
      instructions: r.plus_speech_instructions,
    },
  }));
}
// Returns false when the name or code is already taken.
export async function addLanguage(name: string, code: string) {
  const result = await db.query(
    "INSERT INTO languages(name,code,position) SELECT $1,NULLIF($2,''),COALESCE(max(position),0)+1 FROM languages ON CONFLICT DO NOTHING",
    [name, code],
  );
  invalidateAiSettings();
  return result.rowCount === 1;
}
// "stale" when the language changed since `revision` was read. Throws on a duplicate code
// (23505).
export async function updateLanguage(
  language: LanguageView,
): Promise<"saved" | "missing" | "stale"> {
  const s: Speech = language.speech;
  const p: Speech = language.plusSpeech;
  const result = await db.query(
    `UPDATE languages SET code=NULLIF($2,''),hidden=$3,speech_model=$4,speech_voice=$5,
       speech_instructions=$6,plus_speech_model=$7,plus_speech_voice=$8,
       plus_speech_instructions=$9,updated_at=clock_timestamp()
       WHERE name=$1 AND ${revision}=$10`,
    [
      language.name,
      language.code,
      language.hidden,
      s.model,
      s.voice,
      s.instructions,
      p.model,
      p.voice,
      p.instructions,
      language.revision,
    ],
  );
  invalidateAiSettings();
  if (result.rowCount === 1) return "saved";
  const exists = await db.query("SELECT 1 FROM languages WHERE name=$1", [language.name]);
  return exists.rowCount ? "stale" : "missing";
}
// Positions follow `order`; languages it doesn't mention keep their place after those.
export async function reorderLanguages(order: string[]) {
  await db.query(
    `UPDATE languages l SET position=o.position FROM
       (SELECT name, ordinality AS position FROM unnest($1::text[]) WITH ORDINALITY AS t(name))
       o WHERE l.name=o.name`,
    [order],
  );
  await db.query("UPDATE languages SET position=position+$1 WHERE NOT (name = ANY($2::text[]))", [
    order.length,
    order,
  ]);
  invalidateAiSettings();
}

// The public privacy details, for the /privacy page.
export async function readPrivacy(): Promise<Privacy> {
  const settings = await readSettingsMap();
  return {
    controllerName: settings.get(PRIVACY_NAME) ?? "",
    contactEmail: settings.get(PRIVACY_EMAIL) ?? "",
  };
}
// Whether registration is switched on, and what still blocks it. Sign-up needs both: open, and
// no blockers.
export async function readRegistration(): Promise<RegistrationView> {
  const settings = await readSettingsMap();
  const privacy = {
    controllerName: settings.get(PRIVACY_NAME) ?? "",
    contactEmail: settings.get(PRIVACY_EMAIL) ?? "",
  };
  return {
    ...privacy,
    open: settings.get(REGISTRATION_OPEN) === "true",
    blockers: registrationBlockers(privacy, process.env.APP_ORIGIN ?? ""),
  };
}
// Every value is stored, blank or false included, so the first-start seed from .env never
// brings back something changed here.
export async function saveRegistration(update: Privacy & { open: boolean }) {
  await db.query(
    `INSERT INTO site_settings(key,value) VALUES ($1,$2),($3,$4),($5,$6)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [
      PRIVACY_NAME,
      update.controllerName,
      PRIVACY_EMAIL,
      update.contactEmail,
      REGISTRATION_OPEN,
      String(update.open),
    ],
  );
}
