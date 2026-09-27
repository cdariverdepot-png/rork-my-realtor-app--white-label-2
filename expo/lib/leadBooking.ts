import AsyncStorage from "@react-native-async-storage/async-storage";
import { isKvEnabled, kvGet, kvSet } from "@/lib/kvStore";
import type { Appointment } from "@/contexts/AppointmentsContext";

/**
 * Public booking link (/welcome?ref=<realtorId>): a signed-out visitor has no
 * realtor scope, so their request is written straight into the realtor's
 * shared appointments (same key AppointmentsContext syncs), where the
 * realtor's app picks it up.
 */
export const isRealtorRef = (ref: string | undefined): ref is string =>
  !!ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

export async function appendLeadAppointment(realtorId: string, appt: Appointment): Promise<void> {
  const key = `${realtorId}:appointments.v1`;
  let list: Appointment[] = [];
  if (isKvEnabled()) {
    const row = await kvGet<Appointment[]>(key);
    if (row?.value && Array.isArray(row.value)) list = row.value;
  }
  const next = [appt, ...list.filter((a) => a.id !== appt.id)];
  if (isKvEnabled()) await kvSet(key, next, Date.now(), true);
  else await AsyncStorage.setItem(key, JSON.stringify(next));
}
