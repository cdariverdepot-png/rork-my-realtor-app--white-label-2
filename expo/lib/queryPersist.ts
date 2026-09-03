import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/**
 * Long-lived React Query client tuned for offline-first behavior:
 * - 24h gcTime so persisted entries survive a relaunch
 * - 5min staleTime so cached results render instantly on resume
 * - retries network errors a couple times before surfacing
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h
      staleTime: 1000 * 60 * 5, // 5m
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

/** AsyncStorage persister so cached queries survive cold launches. */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "vance.rq.cache.v1",
  throttleTime: 1000,
});
