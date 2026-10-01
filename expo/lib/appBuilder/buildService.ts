import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import type { BuildSource, SourceEvidence } from "./sourceModel";
import type { ClientLayoutId } from "@/constants/clientLayouts";

export type BuildDraft = {
  heroMessage?: string;
  welcomeNote?: string;
  tagline?: string;
  aboutParagraph?: string;
  conciergeLine?: string;
  contactLine?: string;
  tone?: string;
  layoutId?: ClientLayoutId | null;
  portraitSourceId?: string | null;
  potentialListingSources?: string[];
};

export type SavedBuild = {
  sources: BuildSource[];
  evidence: SourceEvidence[];
  draft: BuildDraft;
  selected_layout: ClientLayoutId | null;
  status: "collecting" | "processing" | "needs-input" | "ready" | "complete";
};

/** Shown only for the edge case: realtor role, not guest access, no cloud session.
 * Real users sign up before /admin/build; guest REALTOR codes use the local path. */
export const BUILDER_AUTH_MESSAGE =
  "Confirm your realtor email and sign in to use the app builder.";

/** AsyncStorage flag written by enterGuestRealtor so build APIs can run locally
 * without a verified Supabase user (test-only access-code path). */
export const GUEST_BUILDER_ACCESS_KEY = "myrealtor.builder.guestAccess.v1";

const localBuildKey = (realtorId: string) => `myrealtor.builder.local.v1.${realtorId}`;

export function isGuestPlaceholderEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith("@guest.myrealtor.app");
}

/** Mark / clear the local guest-builder access flag (AuthContext owns the lifecycle). */
export async function setGuestBuilderAccess(realtorId: string | null): Promise<void> {
  try {
    if (realtorId) {
      await AsyncStorage.setItem(
        GUEST_BUILDER_ACCESS_KEY,
        JSON.stringify({ realtorId, at: Date.now() }),
      );
    } else {
      await AsyncStorage.removeItem(GUEST_BUILDER_ACCESS_KEY);
    }
  } catch (e) {
    console.log("[build] guest access flag", e);
  }
}

async function localGuestRealtorId(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_BUILDER_ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { realtorId?: string };
    return typeof parsed?.realtorId === "string" && parsed.realtorId ? parsed.realtorId : null;
  } catch {
    return null;
  }
}

async function readLocalBuild(realtorId: string): Promise<SavedBuild | null> {
  try {
    const raw = await AsyncStorage.getItem(localBuildKey(realtorId));
    if (!raw) return null;
    return JSON.parse(raw) as SavedBuild;
  } catch {
    return null;
  }
}

async function writeLocalBuild(realtorId: string, build: SavedBuild): Promise<void> {
  await AsyncStorage.setItem(localBuildKey(realtorId), JSON.stringify(build));
}

function emptyBuild(sources: BuildSource[] = []): SavedBuild {
  return {
    sources,
    evidence: [],
    draft: {},
    selected_layout: null,
    status: "collecting",
  };
}

/** True when Supabase has a confirmed, non-anonymous, non-guest realtor session. */
export async function hasVerifiedBuilderAuth(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return false;
    if (isGuestPlaceholderEmail(data.user.email)) return false;
    return true;
  } catch {
    return false;
  }
}

/** True when this device has an active guest REALTOR access-code builder session. */
export async function hasGuestBuilderAccess(): Promise<boolean> {
  return !!(await localGuestRealtorId());
}

type BuilderRoute =
  | { kind: "cloud"; user: { id: string; email?: string | null } }
  | { kind: "local"; realtorId: string };

/**
 * Cloud for verified realtors; local AsyncStorage for guest REALTOR access codes.
 * Throws BUILDER_AUTH_MESSAGE only when neither path applies (edge: non-guest, no auth).
 */
async function resolveBuilderRoute(): Promise<BuilderRoute> {
  const guestId = await localGuestRealtorId();
  if (guestId) return { kind: "local", realtorId: guestId };

  if (!supabase) throw new Error(BUILDER_AUTH_MESSAGE);
  const { data, error } = await supabase.auth.getUser();
  if (
    error ||
    !data.user ||
    data.user.is_anonymous ||
    !data.user.email_confirmed_at ||
    isGuestPlaceholderEmail(data.user.email)
  ) {
    throw new Error(BUILDER_AUTH_MESSAGE);
  }
  return { kind: "cloud", user: data.user };
}

/** Local/preview analyze: mark sources ready and seed a draft the review UI can edit.
 * Does not call the cloud edge function (guests have no verified JWT). */
async function analyzeLocal(realtorId: string): Promise<SavedBuild> {
  const saved = (await readLocalBuild(realtorId)) ?? emptyBuild();
  if (!saved.sources.some((source) => source.kind !== "contacts")) {
    throw new Error("Enter your website to get started, or add a document or image.");
  }
  const sources = saved.sources.map((source) =>
    source.kind === "contacts" ? source : { ...source, status: "ready" as const, error: undefined },
  );
  const evidence: SourceEvidence[] = [];
  for (const source of sources) {
    if (source.kind !== "url" && source.kind !== "listing") continue;
    try {
      const host = new URL(source.uri).hostname.replace(/^www\./i, "");
      const label = host.split(".")[0]?.replace(/[-_]+/g, " ") ?? "";
      if (label) {
        evidence.push({
          field: "realtor.brandName",
          value: label.replace(/\b\w/g, (c) => c.toUpperCase()),
          sourceId: source.id,
          locator: source.uri,
          confidence: 0.55,
        });
      }
    } catch {
      /* ignore bad uri */
    }
  }
  const next: SavedBuild = {
    sources,
    evidence,
    draft: {
      heroMessage: "Welcome — customize this opening line for your clients.",
      aboutParagraph:
        "Tell clients who you are and how you help. Edit this introduction anytime from your app builder.",
      tagline: "",
      welcomeNote: "",
      conciergeLine: "How can I help you today?",
      contactLine: "Reach out anytime.",
      tone: "warm",
      layoutId: "warm-concierge",
      portraitSourceId: sources.find((s) => s.kind === "image")?.id ?? null,
      potentialListingSources: [],
    },
    selected_layout: "warm-concierge",
    status: "needs-input",
  };
  await writeLocalBuild(realtorId, next);
  return next;
}

async function regenerateLocal(
  realtorId: string,
  target: "heroMessage" | "welcomeNote" | "aboutParagraph",
): Promise<SavedBuild> {
  const saved = (await readLocalBuild(realtorId)) ?? emptyBuild();
  if (saved.status === "complete") throw new Error("This draft cannot be regenerated.");
  const alternates: Record<typeof target, string[]> = {
    heroMessage: [
      "Your next home starts with a conversation.",
      "Local expertise. Personal guidance. Real results.",
      "Let’s find the place that feels like yours.",
    ],
    welcomeNote: [
      "Thanks for stopping by — I’m glad you’re here.",
      "Welcome. I’m ready when you are.",
    ],
    aboutParagraph: [
      "I help clients navigate every step of buying and selling with clear advice and steady support.",
      "From first search to closing day, you’ll have a partner who listens and delivers.",
    ],
  };
  const options = alternates[target];
  const current = (saved.draft[target] ?? "").trim();
  const nextValue = options.find((item) => item !== current) ?? options[0];
  const draft = { ...saved.draft, [target]: nextValue };
  const next = { ...saved, draft };
  await writeLocalBuild(realtorId, next);
  return next;
}

export async function loadBuild(): Promise<SavedBuild | null> {
  const route = await resolveBuilderRoute();
  if (route.kind === "local") return readLocalBuild(route.realtorId);

  const { data, error } = await supabase!
    .from("realtor_builds")
    .select("sources,evidence,draft,selected_layout,status")
    .eq("auth_user_id", route.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as SavedBuild | null;
}

export async function saveBuildSources(realtorId: string, sources: BuildSource[]): Promise<void> {
  const route = await resolveBuilderRoute();
  if (route.kind === "local") {
    const id = route.realtorId || realtorId;
    const prev = (await readLocalBuild(id)) ?? emptyBuild();
    await writeLocalBuild(id, {
      ...prev,
      sources,
      evidence: [],
      draft: {},
      selected_layout: null,
      status: "collecting",
    });
    return;
  }

  const { error } = await supabase!.from("realtor_builds").upsert(
    {
      auth_user_id: route.user.id,
      realtor_id: realtorId,
      sources,
      evidence: [],
      draft: {},
      selected_layout: null,
      status: "collecting",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "auth_user_id" },
  );
  if (error) throw error;
}

export async function uploadBuildFile(
  asset: { uri: string; name: string; mimeType?: string; size?: number },
  kind: "document" | "image",
): Promise<BuildSource> {
  const route = await resolveBuilderRoute();
  const extension = asset.name.toLowerCase().split(".").pop();
  const inferred: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const mimeType =
    !asset.mimeType || asset.mimeType === "application/octet-stream"
      ? (inferred[extension ?? ""] ?? "application/octet-stream")
      : asset.mimeType;
  const allowed =
    kind === "image"
      ? ["image/jpeg", "image/png", "image/webp"]
      : [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ];
  if (!allowed.includes(mimeType)) {
    throw new Error("Choose a PDF, Word document, text file, JPG, PNG, or WebP image.");
  }
  if (asset.size && asset.size > 20_971_520) throw new Error("Files must be 20 MB or smaller.");

  const id = randomUUID();

  // Guest / local path: keep the device URI — no cloud storage upload.
  if (route.kind === "local") {
    return { id, kind, label: asset.name, uri: asset.uri, mimeType, status: "queued" };
  }

  const localFile = Platform.OS === "web" ? null : new File(asset.uri);
  if (localFile && localFile.size > 20_971_520) throw new Error("Files must be 20 MB or smaller.");
  const bytes =
    Platform.OS === "web"
      ? await (await fetch(asset.uri)).arrayBuffer()
      : await localFile!.arrayBuffer();
  if (bytes.byteLength > 20_971_520) throw new Error("Files must be 20 MB or smaller.");
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 90);
  const uri = `${route.user.id}/${id}-${safeName}`;
  const { error } = await supabase!.storage
    .from("realtor-build-sources")
    .upload(uri, bytes, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return { id, kind, label: asset.name, uri, mimeType, status: "queued" };
}

/** supabase-js hides the function's JSON body behind a generic "non-2xx" error. */
async function functionError(error: unknown, data: unknown, fallback: string): Promise<Error> {
  const direct =
    data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : "";
  if (direct) return new Error(direct);
  const ctx =
    error && typeof error === "object" && "context" in error
      ? (error as { context?: unknown }).context
      : null;
  if (ctx && typeof (ctx as Response).clone === "function") {
    const res = ctx as Response;
    try {
      const body = (await res.clone().json()) as { error?: string; message?: string };
      if (body?.error || body?.message) return new Error(String(body.error ?? body.message));
    } catch {}
    if (res.status === 404) {
      return new Error("The app builder service isn't deployed yet (analyze-realtor-build).");
    }
    if (res.status === 401) return new Error("Please sign in again to build your app.");
    if (res.status) return new Error(`${fallback} (status ${res.status})`);
  }
  return new Error(error instanceof Error && error.message ? error.message : fallback);
}

export async function analyzeBuild(): Promise<SavedBuild> {
  const route = await resolveBuilderRoute();
  if (route.kind === "local") return analyzeLocal(route.realtorId);

  const { data, error } = await supabase!.functions.invoke("analyze-realtor-build", { body: {} });
  if (error || data?.error) throw await functionError(error, data, "Analysis could not finish.");
  const saved = await loadBuild();
  if (!saved) throw new Error("The build result could not be loaded.");
  return saved;
}

export async function regenerateBuildCopy(
  target: "heroMessage" | "welcomeNote" | "aboutParagraph",
): Promise<SavedBuild> {
  const route = await resolveBuilderRoute();
  if (route.kind === "local") return regenerateLocal(route.realtorId, target);

  const { data, error } = await supabase!.functions.invoke("analyze-realtor-build", {
    body: { mode: "regenerate", target },
  });
  if (error || data?.error) throw await functionError(error, data, "Could not create another version.");
  const saved = await loadBuild();
  if (!saved) throw new Error("The new version could not be loaded.");
  return saved;
}

export async function markBuildComplete(): Promise<void> {
  const route = await resolveBuilderRoute();
  if (route.kind === "local") {
    const saved = (await readLocalBuild(route.realtorId)) ?? emptyBuild();
    await writeLocalBuild(route.realtorId, {
      ...saved,
      status: "complete",
    });
    return;
  }

  const { error } = await supabase!
    .from("realtor_builds")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("auth_user_id", route.user.id);
  if (error) throw error;
}
