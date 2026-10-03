import { Stack } from "expo-router";
import React from "react";
export const unstable_settings = { initialRouteName: 'index' };
export default function AdminLayout() {
  return (
    <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0A0B0E" },
          animation: "slide_from_right",
          animationDuration: 280,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="login"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 320,
          }}
        />
        <Stack.Screen name="index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="listings" />
        <Stack.Screen name="add" />
        <Stack.Screen name="edit/[id]" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="thread/[clientId]" />
        <Stack.Screen name="appointments" />
        <Stack.Screen name="documents" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="studio" />
        <Stack.Screen name="clients" />
        <Stack.Screen name="clients-import" />
        <Stack.Screen name="client-profile" />
        <Stack.Screen name="calendar-import" />
        <Stack.Screen name="feed" />
        <Stack.Screen name="insights" />
        <Stack.Screen name="access" />
        <Stack.Screen name="plans" />
        <Stack.Screen name="diagnostics" />
        <Stack.Screen
          name="build"
          options={{
            animation: "fade",
            animationDuration: 400,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="ready"
          options={{
            animation: "fade",
            animationDuration: 400,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 320,
          }}
        />
      </Stack>
  );
}
