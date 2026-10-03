import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { backOr } from '@/lib/navIntent';

/** Deep links have no prior screen: return to the current audience's home. */
export function useWorkflowBack() {
  const router = useRouter();
  const { isAdmin, viewAsClient } = useAuth();
  const fallback = isAdmin && !viewAsClient ? '/admin' : '/';
  return useCallback(() => backOr(router, fallback), [router, fallback]);
}
