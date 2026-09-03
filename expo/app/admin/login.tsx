import React, { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { dark } from "@/constants/colors";

/**
 * Legacy /admin/login route — superseded by the unified /portal flow.
 * Existing redirect calls (`router.replace("/admin/login")`) still work;
 * we bounce them to the portal so the realtor re-enters via the same
 * cinematic gate as everyone else.
 */
export default function AdminLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/portal");
  }, [router]);
  return <View style={{ flex: 1, backgroundColor: dark.bg }} />;
}
