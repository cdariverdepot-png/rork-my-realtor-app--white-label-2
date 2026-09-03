import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Schedule local push reminders 24h and 1h before a showing. Stores the
 * scheduled identifiers under the appointment id so we can cancel them
 * on remove / reschedule. No-op on web.
 */

const KEY = "vance.reminders.v1";

type Map = Record<string, string[]>;

async function readMap(): Promise<Map> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Map;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(m: Map): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(m));
  } catch (e) {
    console.log("[reminders] persist", e);
  }
}

export async function cancelRemindersFor(apptId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const map = await readMap();
  const ids = map[apptId];
  if (!ids?.length) return;
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)
    )
  );
  delete map[apptId];
  await writeMap(map);
}

export async function scheduleRemindersFor(params: {
  apptId: string;
  title: string;
  startsAt: number;
  body?: string;
}): Promise<void> {
  if (Platform.OS === "web") return;
  const { apptId, title, startsAt, body } = params;
  await cancelRemindersFor(apptId);

  const now = Date.now();
  const oneDay = startsAt - 24 * 60 * 60 * 1000;
  const oneHour = startsAt - 60 * 60 * 1000;
  const ids: string[] = [];

  try {
    if (oneDay > now + 30_000) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Tomorrow · ${title}`,
          body: body ?? "Your private viewing is in 24 hours.",
          data: { kind: "reminder-24h", apptId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(oneDay),
        },
      });
      ids.push(id);
    }
    if (oneHour > now + 30_000) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Soon · ${title}`,
          body: body ?? "Your private viewing is in one hour.",
          data: { kind: "reminder-1h", apptId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(oneHour),
        },
      });
      ids.push(id);
    }
  } catch (e) {
    console.log("[reminders] schedule", e);
  }

  if (ids.length > 0) {
    const map = await readMap();
    map[apptId] = ids;
    await writeMap(map);
  }
}
