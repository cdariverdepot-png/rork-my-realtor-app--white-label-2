import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientsContext";
import { useMessages } from "@/contexts/MessagesContext";
import ChatThread from "@/components/ChatThread";

/**
 * /admin/thread/[clientId] — the realtor's private conversation with one
 * client. Setting the active thread points MessagesContext at this client's
 * isolated `realtorId + clientId` message store.
 */
export default function AdminThread() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { isAdmin, hydrated } = useAuth();
  const { clients } = useClients();
  const { openThread } = useMessages();
  const client = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  useEffect(() => {
    if (clientId) openThread(clientId);
    return () => openThread(null);
  }, [clientId, openThread]);

  const first = client?.name.split(" ")[0] ?? "client";

  return (
    <View style={styles.fill}>
      <ChatThread
        role="realtor"
        eyebrow={client ? `Replying to ${first}` : "Client thread"}
        clientName={client?.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
