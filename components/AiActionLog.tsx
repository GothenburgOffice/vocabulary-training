"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { appendAiAction, isAiAction, type AiAction } from "../lib/ai-actions";

type AiActionLog = { actions: AiAction[]; record: (action: unknown) => void };
const Context = createContext<AiActionLog>({ actions: [], record: () => {} });

export function AiActionLogProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<AiAction[]>([]);
  const record = useCallback((value: unknown) => {
    if (isAiAction(value)) setActions((current) => appendAiAction(current, value));
  }, []);
  const value = useMemo(() => ({ actions, record }), [actions, record]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAiActionLog() {
  return useContext(Context);
}
