import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DeskAdapter, DeskState } from './contract';

type Desk = { adapter: DeskAdapter | null; state: DeskState | null };

const DeskContext = createContext<Desk>({ adapter: null, state: null });

/** Subscribes once to the adapter and shares its latest state with every lane. */
export function DeskProvider({ adapter, children }: { adapter: DeskAdapter | null; children: ReactNode }) {
  const [state, setState] = useState<DeskState | null>(null);
  useEffect(() => {
    if (!adapter) {
      setState(null);
      return;
    }
    return adapter.subscribeState(setState);
  }, [adapter]);
  return <DeskContext.Provider value={{ adapter, state }}>{children}</DeskContext.Provider>;
}

/**
 * The scene and panels lanes read state and send commands through this hook.
 * `state` is null when no adapter is connected; render an honest empty state then.
 * Never mutate `state`; every change goes through `adapter` (no client-side truth mutation).
 */
export function useDesk(): Desk {
  return useContext(DeskContext);
}
