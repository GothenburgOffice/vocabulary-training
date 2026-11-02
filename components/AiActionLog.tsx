"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { appendAiAction, isAiAction, type AiAction } from "../lib/ai-actions";

type AiActionLog = { actions: AiAction[]; record: (action: AiAction) => void };
// Outside the provider nothing is recorded, so components render the same in tests.
const Context = createContext<AiActionLog>({ actions: [], record: () => {} });

// Lives as long as the signed-in workspace: a reload or sign-out clears it.
export function AiActionLogProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<AiAction[]>([]);
  const record = useCallback((action: AiAction) => {
    if (isAiAction(action)) setActions((current) => appendAiAction(current, action));
  }, []);
  const value = useMemo(() => ({ actions, record }), [actions, record]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAiActionLog() {
  return useContext(Context);
}
