import { createContext, useContext } from 'react';
import type { GeminiState } from '@/types/personalGemini';

/**
 * Context plumbing for the personal Gemini connection.
 *
 * Kept apart from the provider component so that file exports a component and
 * nothing else — otherwise every edit to it forces a full reload instead of a
 * fast refresh.
 */
export interface PersonalGeminiValue {
  state: GeminiState;
  /** Index of the running check, while `state === 'checking'`. */
  checkStage: number;
  /** Workspace chosen at the selection step. */
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  /** Moves directly to a state. Used by the flow controls and demo switcher. */
  go: (next: GeminiState) => void;
  /** Runs the timed check sequence, ending at workspace selection. */
  runCheck: () => void;
  /** True only when AI-assisted extraction can actually run. */
  ready: boolean;
}

export const PersonalGeminiContext = createContext<PersonalGeminiValue | null>(null);

export function usePersonalGemini(): PersonalGeminiValue {
  const value = useContext(PersonalGeminiContext);
  if (!value) throw new Error('usePersonalGemini must be used within a PersonalGeminiProvider');
  return value;
}
