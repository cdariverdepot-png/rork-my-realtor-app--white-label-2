import React, { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { dark } from "@/constants/colors";
import { AUTH_BYPASS_ENABLED } from "@/contexts/AuthContext";

/**
 * Legacy /admin/login route — superseded by the unified /portal flow.
 * Existing redirect calls (`router.replace("/admin/login")`) still work;
 * we bounce them to the portal so the realtor re-enters via the same
 * cinematic gate as everyone else.
 *
 * When EXPO_PUBLIC_AUTH_BYPASS is on, send straight to /admin/ so preview
 * never re-shows the Welcome gateway.
 */
export default function AdminLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(AUTH_BYPASS_ENABLED ? "/admin/" : "/");
  }, [router]);
  return <View style={{ flex: 1, backgroundColor: dark.bg }} />;
}
