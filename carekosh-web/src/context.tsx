import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEMO,
  login as apiLogin,
  logout as apiLogout,
  refresh,
  onSessionInvalidated,
  sessionEpoch,
  retryRead,
  readRetryDelay,
} from "./services/api";
import { repository } from "./services/workspace";
import type { Workspace, Repository } from "./services/workspace";
import type { User } from "./domain";
import type { OrderDraft } from "./services/order-review";
import { Dialog } from "./components/ui";
export type Draft = OrderDraft;
type Confirm = {
  title: string;
  body: string;
  label?: string;
  danger?: boolean;
};
interface Context {
  user: User | null;
  authReady: boolean;
  authError: string;
  signIn: (id: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  data: Workspace | undefined;
  loading: boolean;
  error: string;
  refresh: () => Promise<Workspace>;
  updatedAt: number;
  online: boolean;
  busy: boolean;
  act: <T>(fn: (r: Repository) => Promise<T>, success?: string) => Promise<T>;
  notify: (message: string) => void;
  confirm: (options: Confirm) => Promise<boolean>;
  draft: Draft | null;
  setDraft: (d: Draft | null | ((d: Draft | null) => Draft | null)) => void;
  getDraft: () => Draft | null;
  replaceDraft: (expected: Draft, next: Draft) => boolean;
  theme: string;
  toggleTheme: () => void;
  coachOpen: boolean;
  setCoachOpen: (v: boolean) => void;
}
const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function AppProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [authReady, setReady] = useState(false),
    [authError, setAuthError] = useState("");
  const [draft, renderDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [coachOpen, setCoachOpen] = useState(false);
  const draftRef = useRef<Draft | null>(null);
  const getDraft = useCallback(() => draftRef.current, []);
  const setDraft = useCallback(
    (update: Draft | null | ((d: Draft | null) => Draft | null)) => {
      const next =
        typeof update === "function" ? update(draftRef.current) : update;
      draftRef.current = next;
      renderDraft(next);
    },
    [],
  );
  const replaceDraft = useCallback(
    (expected: Draft, next: Draft) => {
      if (draftRef.current !== expected) return false;
      setDraft(next);
      return true;
    },
    [setDraft],
  );
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme || "dark",
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [dialog, setDialog] = useState<
    (Confirm & { resolve: (v: boolean) => void }) | null
  >(null);
  const lock = useRef(false);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const clear = useCallback(() => {
    qc.clear();
    setUser(null);
    setDraft(null);
    setCoachOpen(false);
    dialogRef.current?.resolve(false);
    setDialog(null);
  }, [qc, setDraft]);
  useEffect(() => {
    onSessionInvalidated(clear);
    let active = true;
    void (async () => {
      try {
        if (DEMO) {
          const m = await import("./demo/repository");
          if (active)
            setUser(
              sessionStorage.getItem("carekosh-demo-signed-out")
                ? null
                : { ...m.demoUser },
            );
        } else {
          const u = await refresh();
          if (active) setUser(u);
        }
      } catch (e) {
        if (active) setAuthError((e as Error).message);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [clear]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  const query = useQuery({
    queryKey: ["workspace", user?.id],
    queryFn: async ({ signal }) => (await repository()).load(signal),
    enabled: !!user,
    staleTime: 15000,
    retry: retryRead,
    retryDelay: readRetryDelay,
    refetchOnWindowFocus: true,
  });
  const reload = async () => {
    const result = await query.refetch();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Your workspace could not be refreshed.");
    return result.data;
  };
  const act: Context["act"] = async (fn, success) => {
    if (lock.current)
      throw new Error("Please wait for the current change to finish.");
    if (!online && !DEMO)
      throw new Error("You are offline. Reconnect before making changes.");
    lock.current = true;
    setBusy(true);
    const start = sessionEpoch();
    try {
      const source = await repository();
      const scoped = new Proxy(source, {
        get(target, key) {
          const method = Reflect.get(target, key);
          if (typeof method !== "function") return method;
          return (...args: unknown[]) => {
            if (start !== sessionEpoch())
              throw new Error("Account changed. Operation stopped.");
            return method.apply(target, args);
          };
        },
      });
      const value = await fn(scoped);
      if (start !== sessionEpoch()) throw new Error("Account changed.");
      await qc.invalidateQueries({ queryKey: ["workspace"] });
      if (success) setToast(success);
      return value;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const signIn = async (id: string, password: string) => {
    setAuthError("");
    if (DEMO) {
      qc.clear();
      setDraft(null);
      sessionStorage.removeItem("carekosh-demo-signed-out");
      setUser({ ...(await import("./demo/repository")).demoUser });
      // A successful API sign-in clears the replaced session through clear().
    } else setUser(await apiLogin(id, password));
  };
  const signOut = async () => {
    if (DEMO) {
      sessionStorage.setItem("carekosh-demo-signed-out", "1");
      clear();
    } else
      try {
        await apiLogout();
      } catch (e) {
        setAuthError(
          `Signed out here. Server logout was not confirmed: ${(e as Error).message}`,
        );
      } finally {
        clear();
      }
  };
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("carekosh-theme", next);
    } catch {
      /* Theme stays in memory. */
    }
  };
  const confirm = (options: Confirm) =>
    new Promise<boolean>((resolve) => setDialog({ ...options, resolve }));
  const resolve = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };
  return (
    <AppContext.Provider
      value={{
        user,
        authReady,
        authError,
        signIn,
        signOut,
        setUser,
        data: query.data,
        loading: query.isPending,
        error: query.error?.message || "",
        refresh: reload,
        updatedAt: query.dataUpdatedAt,
        online,
        busy,
        act,
        notify: setToast,
        confirm,
        draft,
        setDraft,
        getDraft,
        replaceDraft,
        theme,
        toggleTheme,
        coachOpen,
        setCoachOpen,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="status-dot good" />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
      {dialog && (
        <Dialog title={dialog.title} onClose={() => resolve(false)}>
          <p className="dialog-copy">{dialog.body}</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => resolve(false)}>
              Cancel
            </button>
            <button
              className={`button ${dialog.danger ? "danger" : "primary"}`}
              onClick={() => resolve(true)}
            >
              {dialog.label || "Confirm"}
            </button>
          </div>
        </Dialog>
      )}
    </AppContext.Provider>
  );
}
