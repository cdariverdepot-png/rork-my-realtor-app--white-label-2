import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { ensureSupabaseSession, supabase } from "@/lib/supabase";

/** Owner support inbox — same address the admin dashboard uses. */
export const ERROR_REPORT_EMAIL = "contact@myrealtorapp.com";

export type ClientErrorReport = {
  message: string;
  stack?: string;
  componentStack?: string;
  pathname?: string;
  userAgent?: string;
  timestamp: string;
  platform: string;
  platformVersion?: string | number;
  commit?: string;
  appVersion?: string;
  role?: string | null;
  guestAccess?: boolean;
  preview?: boolean;
};

const SESSION_KEY = "myrealtor.auth.session.v4";

async function readAuthRole(): Promise<{
  role: string | null;
  guestAccess?: boolean;
  preview?: boolean;
}> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return { role: null };
    const parsed = JSON.parse(raw) as {
      role?: string | null;
      guestAccess?: boolean;
      preview?: boolean;
    };
    return {
      role: typeof parsed.role === "string" ? parsed.role : null,
      guestAccess: !!parsed.guestAccess,
      preview: !!parsed.preview,
    };
  } catch {
    return { role: null };
  }
}

function buildCommit(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = extra.commitSha ?? extra.gitCommit ?? extra.EAS_BUILD_ID;
  if (typeof fromExtra === "string" && fromExtra.trim()) return fromExtra.trim();
  const updates = Constants.expoConfig?.updates as { requestHeaders?: Record<string, string> } | undefined;
  const header = updates?.requestHeaders?.["expo-channel-name"];
  return typeof header === "string" ? header : undefined;
}

/**
 * Build a full crash report and deliver it to support.
 * Prefer the Supabase `report-client-error` edge function (Resend).
 * Never throws — reporting must not block the error UI.
 */
export async function reportClientError( partial: {
  message: string;
  stack?: string;
  componentStack?: string;
}): Promise<{ ok: boolean; emailed?: boolean }> {
  try {
    const auth = await readAuthRole();
    const pathname =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location?.pathname ?? ""
        : undefined;
    const userAgent =
      Platform.OS === "web" && typeof navigator !== "undefined"
        ? navigator.userAgent
        : undefined;

    const report: ClientErrorReport = {
      message: (partial.message || "Unknown error").slice(0, 2000),
      stack: (partial.stack || "").slice(0, 4000) || undefined,
      componentStack: (partial.componentStack || "").slice(0, 2000) || undefined,
      pathname,
      userAgent: userAgent?.slice(0, 400),
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
      platformVersion: Platform.Version,
      commit: buildCommit(),
      appVersion: Constants.expoConfig?.version,
      role: auth.role === "admin" ? "realtor" : auth.role,
      guestAccess: auth.guestAccess,
      preview: auth.preview,
    };

    console.log("[error-report]", report.message, report.pathname, report.role);

    if (supabase) {
      await ensureSupabaseSession();
      const { data, error } = await supabase.functions.invoke("report-client-error", {
        body: report,
      });
      if (error) {
        console.log("[error-report] edge invoke failed", error.message?.slice(0, 120));
        return { ok: false };
      }
      const emailed = !!(data && typeof data === "object" && (data as { emailed?: boolean }).emailed);
      return { ok: true, emailed };
    }
    return { ok: false };
  } catch (e) {
    console.log("[error-report] failed", e);
    return { ok: false };
  }
}
