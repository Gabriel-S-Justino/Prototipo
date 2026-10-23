import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { createMissionState, missionReducer, planOf, type MissionAction, type MissionState } from './mission';
import type { MissionPlan } from '../simulation/mission/plan';

interface MissionContextValue {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  /** Plano derivado do estado atual — a fonte única dos números de todas as telas. */
  plan: MissionPlan;
}

const MissionContext = createContext<MissionContextValue | null>(null);

export function MissionProvider({ children, initial }: { children: ReactNode; initial?: MissionState }) {
  const [state, dispatch] = useReducer(missionReducer, initial ?? createMissionState());
  const plan = useMemo(() => planOf(state), [state.design, state.selection, state.ephemeris]);
  return <MissionContext.Provider value={{ state, dispatch, plan }}>{children}</MissionContext.Provider>;
}

export function useMission() {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error('useMission precisa estar dentro de <MissionProvider>.');
  return ctx;
}
