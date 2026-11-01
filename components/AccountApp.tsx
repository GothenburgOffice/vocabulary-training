"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, LogOut, RefreshCw, Settings } from "lucide-react";
import { BookMark } from "../lib/brand";
import Workspace from "./Workspace";
import type { WorkspaceData } from "../lib/workspace";
import { PASSWORD_MAX, PASSWORD_MIN } from "../lib/validation";

type Account = { id: string; email: string; is_admin?: boolean };
type Loaded = { user: Account; data: WorkspaceData; revision: number };
const fingerprint = (data: WorkspaceData) =>
  JSON.stringify(data, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

export default function AccountApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("All changes saved");
  const [saveError, setSaveError] = useState("");
  const revision = useRef(0);
  const saved = useRef("");
  const pending = useRef<WorkspaceData | null>(null);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const blocked = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (response.status === 401) {
        setLoaded(null);
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      revision.current = result.revision;
      saved.current = fingerprint(result.data);
      pending.current = null;
      dirty.current = false;
      blocked.current = false;
      setStatus("All changes saved");
      setSaveError("");
      setLoaded(result);
    } catch (e) {
      setError((e as Error).message || "Could not load your workspace. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    blocked.current = false;
    setSaveError("");
    try {
      while (pending.current) {
        const data = pending.current;
        pending.current = null;
        setStatus("Saving changes…");
        try {
          const result = await request("/api/workspace", {
            method: "PUT",
            body: JSON.stringify({ data, revision: revision.current }),
          });
          revision.current = result.revision;
          saved.current = fingerprint(data);
        } catch (e) {
          pending.current ??= data;
          throw e;
        }
      }
      dirty.current = false;
      setStatus("All changes saved");
    } catch (e) {
      dirty.current = true;
      blocked.current = true;
      setStatus("Changes not saved");
      setSaveError((e as Error).message);
    } finally {
      saving.current = false;
    }
  }, []);
  const changed = useCallback(
    (data: WorkspaceData) => {
      if (fingerprint(data) === saved.current && !saving.current) return;
      pending.current = data;
      dirty.current = true;
      setStatus("Unsaved changes");
      if (timer.current) clearTimeout(timer.current);
      // A conflict/error requires an explicit retry; never silently overwrite another tab.
      if (!blocked.current)
        timer.current = setTimeout(() => {
          void flush();
        }, 350);
    },
    [flush],
  );

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action, email, password }),
      });
      setPassword("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (dirty.current) {
      setSaveError(
        "Save your changes before signing out. Retry saving, or export your word lists before reloading.",
      );
      return;
    }
    setBusy(true);
    try {
      await request("/api/auth", { method: "DELETE", body: "{}" });
      setLoaded(null);
      setEmail("");
      setPassword("");
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="auth-screen">
        <p role="status">Opening your workspace…</p>
      </main>
    );
  if (!loaded)
    return (
      <main className="auth-screen">
        <div className="auth-content">
          <div className="auth-brand">
            <BookMark aria-hidden="true" size={28} />
            <span>
              vocabulary<strong>.training</strong>
            </span>
          </div>
          <h1>{action === "login" ? "A few words. Every day." : "Make room for new words."}</h1>
          <p>
            Keep your own word lists. Practise what needs attention. Build confidence, one small
            session at a time.
          </p>
          <form onSubmit={authenticate}>
            <h2>{action === "login" ? "Sign in to your workspace" : "Create your account"}</h2>
            <label className="field">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Password
              <input
                required
                type="password"
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                autoComplete={action === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small>Use at least {PASSWORD_MIN} characters. A passphrase works well.</small>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Please wait…" : action === "login" ? "Sign in" : "Create account"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button auth-switch"
            onClick={() => {
              setAction(action === "login" ? "register" : "login");
              setError("");
            }}
          >
            {action === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
          <p className="auth-note">
            No public word lists. Your workspace belongs to your account. Optional AI comments send
            the current exercise to Requesty and its provider; speaker buttons send only the clicked
            word.
          </p>
          <p className="auth-note">
            This first version has no email verification or password recovery. Keep your password
            safe.
          </p>
          {error && (
            <button className="text-button" onClick={() => void load()}>
              <RefreshCw size={15} /> Retry connection
            </button>
          )}
        </div>
      </main>
    );
  return (
    <>
      <div className="account-bar">
        <span title={loaded.user.email}>{loaded.user.email}</span>
        <span className="save-state" role="status">
          {status === "All changes saved" && <Check size={14} />} {status}
        </span>
        {loaded.user.is_admin && (
          <a className="text-button" href="/admin">
            <Settings size={15} /> Admin
          </a>
        )}
        <button className="text-button" disabled={busy} onClick={() => void logout()}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
      {saveError && (
        <div className="save-error" role="alert">
          <span>{saveError} Your current words remain in this tab.</span>
          <button className="button" onClick={() => void flush()}>
            Retry save
          </button>
        </div>
      )}
      <Workspace key={loaded.user.id} initial={loaded.data} onChange={changed} />
    </>
  );
}
