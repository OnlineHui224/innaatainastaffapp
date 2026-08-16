import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CHECK_STAGES, type GeminiState } from '@/types/personalGemini';
import { PersonalGeminiContext, type PersonalGeminiValue } from './personalGeminiStore';

/**
 * PERSONAL GEMINI — UI-ONLY SHARED STATE
 *
 * Holds which connection state the interface is presenting, so the account
 * panel, Flight Document Ops, the Visa & Contract Logger and Staff Management
 * all agree without prop-drilling through unrelated components.
 *
 * This is deliberately SEPARATE from `AuthContext`, which is untouched:
 * HajjERP/Supabase remains the application's only sign-in, and a personal
 * Gemini connection is a secondary authorization that never affects it.
 *
 * Nothing here is persisted, requested or stored. There is no token, no key and
 * no credential in this module — the state is in-memory for the session only,
 * and resets on reload. The "checking" sequence is a timed UI progression, not
 * a real availability check.
 */

export function PersonalGeminiProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GeminiState>('not_configured');
  const [checkStage, setCheckStage] = useState(0);
  const [workspaceId, setWorkspaceId] = useState('ops');
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const go = useCallback(
    (next: GeminiState) => {
      clearTimers();
      setState(next);
    },
    [clearTimers],
  );

  /**
   * Steps through the named checks and lands on workspace selection.
   *
   * Purely a UI progression — no availability is actually queried, and no
   * Google or Gemini endpoint is contacted.
   */
  const runCheck = useCallback(() => {
    clearTimers();
    setState('checking');
    setCheckStage(0);

    for (let i = 1; i <= CHECK_STAGES.length; i += 1) {
      timers.current.push(
        setTimeout(() => {
          setCheckStage(i);
          if (i === CHECK_STAGES.length) setState('workspace');
        }, i * 900),
      );
    }
  }, [clearTimers]);

  const value = useMemo<PersonalGeminiValue>(
    () => ({
      state,
      checkStage,
      workspaceId,
      setWorkspaceId,
      go,
      runCheck,
      ready: state === 'connected',
    }),
    [state, checkStage, workspaceId, go, runCheck],
  );

  return <PersonalGeminiContext.Provider value={value}>{children}</PersonalGeminiContext.Provider>;
}
