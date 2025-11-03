import { useCallback, useState } from "react";
import type { StoredState } from "../components/playground/types";

const PLAYGROUND_STORAGE_KEY = "sentra.playground.state";

function loadStoredState(): StoredState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLAYGROUND_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as StoredState;
    }
  } catch (error) {
    console.warn("Failed to parse playground storage", error);
  }
  return {};
}

function persistStoredState(state: StoredState) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(PLAYGROUND_STORAGE_KEY);
    } else {
      const cleaned = Object.fromEntries(
        Object.entries(state).filter(([, value]) => value !== undefined)
      );
      window.localStorage.setItem(
        PLAYGROUND_STORAGE_KEY,
        JSON.stringify(cleaned)
      );
    }
  } catch (error) {
    console.warn("Failed to persist playground storage", error);
  }
}

function mergeStoredState(
  prev: StoredState,
  patch: Partial<StoredState>
): StoredState {
  const next: StoredState = { ...prev };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) {
      delete (next as Record<string, unknown>)[key];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  });
  return next;
}

export function usePlaygroundStoredState() {
  const [storedState, setStoredState] = useState<StoredState>(
    () => loadStoredState()
  );

  const updateStoredState = useCallback((patch: Partial<StoredState>) => {
    setStoredState((prev) => {
      const next = mergeStoredState(prev, patch);
      persistStoredState(next);
      return next;
    });
  }, []);

  return { storedState, updateStoredState };
}
