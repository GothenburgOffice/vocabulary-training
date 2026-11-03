"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { BookMark } from "../lib/brand";
import Workspace from "./Workspace";
import type {
  Review,
  Run,
  SaveState,
  WorkspaceAccount,
  WorkspaceData,
  WorkspaceSync,
} from "../lib/workspace";
import type { History, List } from "../lib/learning";
import { NO_AI, type AiFeatures, type Language } from "../lib/languages";
import { AiFeaturesContext } from "./AiFeatures";
import { AiActionLogProvider } from "./AiActionLog";
import { PASSWORD_MAX, PASSWORD_MIN } from "../lib/validation";

type Account = { id: string; email: string; is_admin?: boolean };
type Loaded = {
  user: Account;
  data: WorkspaceData;
  listRevisions: Record<string, number>;
  languages?: Language[];
  ai?: AiFeatures;
};
// One change to save, in the order Workspace made it.
type Change =
  | { kind: "list"; list: List }
  | { kind: "delete"; listId: string; done: (deleted: boolean) => void }
  | { kind: "review"; review: Review; saved: (history: History | null) => void }
  | { kind: "run"; run: Run }
  | { kind: "profile"; baseLanguage: string; learningLanguage: string };
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new RequestError(result.error || "The request failed.", response.status);
  return result;
}
// The signed-in account's workspace, or null when signed out.
async function readWorkspace(): Promise<Loaded | null> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (response.status === 401) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
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
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  // Changes not saved yet, oldest first, and each list's last saved revision.
  const queue = useRef<Change[]>([]);
  const revisions = useRef(new Map<string, number>());
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  // Edits the workspace holds but hasn't reported (WorkspaceSync.pending).
  const pending = useRef(false);
  const [hasPending, setHasPending] = useState(false);
  const blocked = useRef(false);

  // Shows the workspace the server returns, or the sign-in screen when signed out. State
  // changes only once the server answers; `load` shows the loading screen first.
  // A result that arrives after `current()` turns false is dropped: applying it would reset the
  // save queue under edits made since (a load must never discard unsaved changes).
  const open = useCallback(
    (current: () => boolean = () => true) =>
      readWorkspace()
        .then((result) => {
          if (!current()) return;
          if (result) {
            revisions.current = new Map(Object.entries(result.listRevisions ?? {}));
            queue.current = [];
            dirty.current = false;
            blocked.current = false;
            setSave("saved");
            setSaveError("");
          }
          setLoaded(result);
        })
        .catch((e) => {
          if (current())
            setError((e as Error).message || "Could not load your workspace. Please retry.");
        })
        .finally(() => {
          if (current()) setLoading(false);
        }),
    [],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    await open();
  }, [open]);
  // The first render already shows the loading screen. Strict Mode runs this twice in
  // development; only the last run's result is used.
  useEffect(() => {
    let current = true;
    void open(() => current);
    return () => {
      current = false;
    };
  }, [open]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || pending.current) {
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

  const send = useCallback(async (change: Change) => {
    if (change.kind === "list") {
      const { id, title, description, from, to, words } = change.list;
      const result = await request(`/api/lists/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          revision: revisions.current.get(id) ?? null,
          list: {
            title,
            description,
            from,
            to,
            words: words.map((w) => ({
              id: w.id,
              front: w.front,
              back: w.back,
              accepted: w.accepted ?? [],
            })),
          },
        }),
      });
      revisions.current.set(id, result.revision);
    } else if (change.kind === "delete") {
      const { listId } = change;
      const revision = revisions.current.get(listId);
      // A list never saved has nothing on the server to delete.
      if (revision !== undefined) {
        try {
          await request(`/api/lists/${listId}`, {
            method: "DELETE",
            body: JSON.stringify({ revision }),
          });
        } catch (e) {
          // Changed in another tab: not deleted. That is the server's answer, not a failure,
          // so the queue goes on; retrying the same revision could never succeed.
          if (e instanceof RequestError && e.status === 409) {
            change.done(false);
            return;
          }
          // Already deleted in another tab.
          if (!(e instanceof RequestError && e.status === 404)) throw e;
        }
      }
      revisions.current.delete(listId);
      change.done(true);
    } else if (change.kind === "review") {
      try {
        const result = await request("/api/reviews", {
          method: "POST",
          body: JSON.stringify(change.review),
        });
        change.saved(result.history);
      } catch (e) {
        // The word was deleted in another tab: nothing left to schedule.
        if (!(e instanceof RequestError && e.status === 404)) throw e;
        change.saved(null);
      }
    } else if (change.kind === "run") {
      const { run } = change;
      await request("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          id: run.id,
          listId: run.listId ?? null,
          title: run.title,
          mode: run.mode ?? "",
          from: run.from,
          to: run.to,
          completedAt: run.completedAt,
          results: run.results.map((r) => ({ ...r, answeredAt: r.answeredAt ?? run.completedAt })),
        }),
      });
    } else {
      const { baseLanguage, learningLanguage } = change;
      await request("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ baseLanguage, learningLanguage }),
      });
    }
  }, []);
  // Sends queued changes one at a time, in order. A failed change stays first in the queue
  // until an explicit retry; a conflict is never overwritten.
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    blocked.current = false;
    setSaveError("");
    try {
      while (queue.current.length) {
        setSave("saving");
        await send(queue.current[0]);
        queue.current.shift();
      }
      dirty.current = false;
      setSave("saved");
    } catch (e) {
      dirty.current = true;
      blocked.current = true;
      setSave("failed");
      setSaveError((e as Error).message);
    } finally {
      saving.current = false;
    }
  }, [send]);
  const enqueue = useCallback(
    (change: Change) => {
      // A newer save of the same list or the profile replaces the last queued change when
      // that is its earlier save, so nothing moves ahead of changes made in between. (The
      // first entry may be in flight, so it is never replaced.)
      const last = queue.current.length - 1;
      const queued = queue.current[last];
      const replaces =
        last > 0 &&
        ((change.kind === "list" && queued.kind === "list" && queued.list.id === change.list.id) ||
          (change.kind === "profile" && queued.kind === "profile"));
      if (replaces) queue.current[last] = change;
      else queue.current.push(change);
      dirty.current = true;
      setSave("unsaved");
      if (timer.current) clearTimeout(timer.current);
      // A conflict/error requires an explicit retry; never silently overwrite another tab.
      if (!blocked.current)
        timer.current = setTimeout(() => {
          void flush();
        }, 350);
    },
    [flush],
  );
  const sync = useMemo<WorkspaceSync>(
    () => ({
      saveList: (list) => enqueue({ kind: "list", list }),
      deleteList: (listId) => new Promise((done) => enqueue({ kind: "delete", listId, done })),
      review: (review) => new Promise((saved) => enqueue({ kind: "review", review, saved })),
      completeRun: (run) => enqueue({ kind: "run", run }),
      saveProfile: (baseLanguage, learningLanguage) =>
        enqueue({ kind: "profile", baseLanguage, learningLanguage }),
      pending: (value) => {
        pending.current = value;
        setHasPending(value);
      },
    }),
    [enqueue],
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
    if (pending.current) {
      setSaveError(
        "Some edits aren't saved yet. Finish or remove the unfinished word pairs, or import the pasted list, before signing out.",
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
            {action === "register" && (
              <p className="auth-note">
                By creating an account, you request the service. Read how your data is handled in{" "}
                <a href="/privacy">Privacy and cookies</a>; this isn&apos;t consent to tracking or
                marketing.
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
          <p className="auth-note">
            One essential sign-in cookie, and your practice settings in your browser. No analytics,
            advertising or tracking. <a href="/privacy">Privacy and cookies</a>
          </p>
          {error && (
            <button className="text-button" onClick={() => void load()}>
              <RefreshCw size={15} /> Retry connection
            </button>
          )}
        </div>
      </main>
    );
  const account: WorkspaceAccount = {
    email: loaded.user.email,
    isAdmin: !!loaded.user.is_admin,
    // Unreported edits are unsaved, unless something is saving or failed.
    save: save === "saved" && hasPending ? "unsaved" : save,
    saveError,
    busy,
    onRetry: () => void flush(),
    onSignOut: () => void logout(),
  };
  return (
    <AiFeaturesContext.Provider value={loaded.ai ?? NO_AI}>
      <AiActionLogProvider>
        <Workspace
          key={loaded.user.id}
          initial={loaded.data}
          sync={sync}
          account={account}
          languageList={loaded.languages}
        />
      </AiActionLogProvider>
    </AiFeaturesContext.Provider>
  );
}
