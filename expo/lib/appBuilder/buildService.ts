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

async function verifiedUser() {
  if (!supabase) throw new Error("Connect to your account to build your app.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    throw new Error("Confirm your realtor email and sign in to use the app builder.");
  }
  return data.user;
}

export async function loadBuild(): Promise<SavedBuild | null> {
  const user = await verifiedUser();
  const { data, error } = await supabase!.from("realtor_builds")
    .select("sources,evidence,draft,selected_layout,status")
    .eq("auth_user_id", user.id).maybeSingle();
  if (error) throw error;
  return data as SavedBuild | null;
}

export async function saveBuildSources(realtorId: string, sources: BuildSource[]): Promise<void> {
  const user = await verifiedUser();
  const { error } = await supabase!.from("realtor_builds").upsert({
    auth_user_id: user.id, realtor_id: realtorId, sources,
    evidence: [], draft: {}, selected_layout: null,
    status: "collecting", updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id" });
  if (error) throw error;
}

export async function uploadBuildFile(asset: { uri: string; name: string; mimeType?: string; size?: number },
  kind: "document" | "image"): Promise<BuildSource> {
  const user = await verifiedUser();
  const extension = asset.name.toLowerCase().split(".").pop();
  const inferred: Record<string, string> = {
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  };
  const mimeType = !asset.mimeType || asset.mimeType === "application/octet-stream"
    ? inferred[extension ?? ""] ?? "application/octet-stream" : asset.mimeType;
  const allowed = kind === "image"
    ? ["image/jpeg", "image/png", "image/webp"]
    : ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
  if (!allowed.includes(mimeType)) throw new Error("Choose a PDF, Word document, text file, JPG, PNG, or WebP image.");
  if (asset.size && asset.size > 20_971_520) throw new Error("Files must be 20 MB or smaller.");
  const localFile = Platform.OS === "web" ? null : new File(asset.uri);
  if (localFile && localFile.size > 20_971_520) throw new Error("Files must be 20 MB or smaller.");
  const bytes = Platform.OS === "web" ? await (await fetch(asset.uri)).arrayBuffer()
    : await localFile!.arrayBuffer();
  if (bytes.byteLength > 20_971_520) throw new Error("Files must be 20 MB or smaller.");
  const id = randomUUID();
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 90);
  const uri = `${user.id}/${id}-${safeName}`;
  const { error } = await supabase!.storage.from("realtor-build-sources")
    .upload(uri, bytes, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return { id, kind, label: asset.name, uri, mimeType, status: "queued" };
}

/** supabase-js hides the function's JSON body behind a generic "non-2xx" error. */
async function functionError(error: unknown, data: unknown, fallback: string): Promise<Error> {
  const direct = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : "";
  if (direct) return new Error(direct);
  const ctx = error && typeof error === "object" && "context" in error ? (error as { context?: unknown }).context : null;
  if (ctx && typeof (ctx as Response).clone === "function") {
    const res = ctx as Response;
    try {
      const body = await res.clone().json() as { error?: string; message?: string };
      if (body?.error || body?.message) return new Error(String(body.error ?? body.message));
    } catch {}
    if (res.status === 404) return new Error("The app builder service isn't deployed yet (analyze-realtor-build).");
    if (res.status === 401) return new Error("Please sign in again to build your app.");
    if (res.status) return new Error(`${fallback} (status ${res.status})`);
  }
  return new Error(error instanceof Error && error.message ? error.message : fallback);
}

export async function analyzeBuild(): Promise<SavedBuild> {
  await verifiedUser();
  const { data, error } = await supabase!.functions.invoke("analyze-realtor-build", { body: {} });
  if (error || data?.error) throw await functionError(error, data, "Analysis could not finish.");
  const saved = await loadBuild();
  if (!saved) throw new Error("The build result could not be loaded.");
  return saved;
}

export async function regenerateBuildCopy(target: "heroMessage" | "welcomeNote" | "aboutParagraph"): Promise<SavedBuild> {
  await verifiedUser();
  const { data, error } = await supabase!.functions.invoke("analyze-realtor-build", {
    body: { mode: "regenerate", target },
  });
  if (error || data?.error) throw await functionError(error, data, "Could not create another version.");
  const saved = await loadBuild();
  if (!saved) throw new Error("The new version could not be loaded.");
  return saved;
}

export async function markBuildComplete(): Promise<void> {
  const user = await verifiedUser();
  const { error } = await supabase!.from("realtor_builds").update({
    status: "complete", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("auth_user_id", user.id);
  if (error) throw error;
}
