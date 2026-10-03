import React, { createContext, useContext, useRef } from 'react';

/** Unpublished edits survive route changes, but never an account change or logout. */
const WorkflowDraftContext = createContext<Map<string, unknown> | null>(null);
export function WorkflowDraftProvider({ children }: { children: React.ReactNode }) {
  const drafts = useRef(new Map<string, unknown>()).current;
  return <WorkflowDraftContext.Provider value={drafts}>{children}</WorkflowDraftContext.Provider>;
}
export function useWorkflowDrafts() {
  const drafts = useContext(WorkflowDraftContext);
  if (!drafts) throw new Error('WorkflowDraftProvider is required');
  return drafts;
}
