import React, { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { dark } from "@/constants/colors";

/**
 * Legacy /login route — superseded by the unified /portal flow.
 * We bounce any direct link straight to the portal so the experience
 * stays consistent across every entry point.
 */
export default function ClientLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return <View style={{ flex: 1, backgroundColor: dark.bg }} />;
}
