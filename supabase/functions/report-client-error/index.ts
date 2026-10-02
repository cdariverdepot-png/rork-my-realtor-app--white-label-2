// Supabase Edge Function — report-client-error
//
// Receives a client crash/error report from ErrorBoundary and emails it to
// contact@myrealtorapp.com via Resend. No user secrets are accepted or logged.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY    — preferred mail path (optional; FormSubmit used if missing)
//   ERROR_REPORT_TO   — optional, defaults to contact@myrealtorapp.com
//   ERROR_REPORT_FROM — optional Resend from-address
// Falls back to FormSubmit.co → contact@ when Resend is unset.
//
// Deploy:
//   supabase functions deploy report-client-error --project-ref xdcqjaodcvnlawqcunrr --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReportBody = {
  message?: string;
  stack?: string;
  componentStack?: string;
  pathname?: string;
  userAgent?: string;
  timestamp?: string;
  platform?: string;
  platformVersion?: string | number;
  commit?: string;
  appVersion?: string;
  role?: string | null;
  guestAccess?: boolean;
  preview?: boolean;
};

function clip(v: unknown, max: number): string {
  if (v == null) return "";
  const s = String(v).replace(/Bearer\s+[\w.-]+/gi,'Bearer [redacted]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g,'$1').replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]');
  return s.length > max ? s.slice(0, max) : s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const authorization=req.headers.get('authorization')??'';
  const caller=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:identity,error:identityError}=await caller.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(identityError || !identity.user) return new Response('Sign in required',{status:401,headers:cors});
  const {data:allowed,error:quotaError}=await caller.rpc('allow_error_report');
  if(quotaError || allowed!==true) return new Response('Please try later',{status:429,headers:cors});
  if(Number(req.headers.get('content-length')??0)>16000) return new Response('Report too large',{status:413,headers:cors});
  let body: ReportBody = {};
  try {
    body = (await req.json()) as ReportBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const to = Deno.env.get("ERROR_REPORT_TO") || "contact@myrealtorapp.com";
  const from = Deno.env.get("ERROR_REPORT_FROM") || "My Realtor App Errors <onboarding@resend.dev>";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";

  const message = clip(body.message, 2000) || "Unknown error";
  const timestamp = clip(body.timestamp, 80) || new Date().toISOString();
  const pathname = clip(body.pathname, 300).split(/[?#]/)[0];
  const platform = clip(body.platform, 40);
  const platformVersion = clip(body.platformVersion, 40);
  const role = clip(body.role, 40) || "unknown";
  const commit = clip(body.commit, 80);
  const appVersion = clip(body.appVersion, 40);
  const userAgent = clip(body.userAgent, 400);
  const stack = clip(body.stack, 4000);
  const componentStack = clip(body.componentStack, 2000);
  const flags = [
    body.guestAccess ? "guestAccess" : "",
    body.preview ? "preview" : "",
  ].filter(Boolean).join(", ") || "none";

  const text = [
    "My Realtor App — client error report",
    "",
    `When:      ${timestamp}`,
    `Message:   ${message}`,
    `Path:      ${pathname || "(n/a)"}`,
    `Platform:  ${platform} ${platformVersion}`.trim(),
    `Role:      ${role}`,
    `Flags:     ${flags}`,
    `Version:   ${appVersion || "(n/a)"}`,
    `Commit:    ${commit || "(n/a)"}`,
    `UA:        ${userAgent || "(n/a)"}`,
    "",
    "—— Stack ——",
    stack || "(none)",
    "",
    "—— Component stack ——",
    componentStack || "(none)",
  ].join("\n");

  // Best-effort persist so reports aren't lost if mail fails.
  let stored = false;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await sb.from("client_error_reports").insert({
        message,
        pathname: pathname || null,
        platform: platform || null,
        role: role || null,
        report: {
          timestamp,
          platformVersion,
          commit: commit || null,
          appVersion: appVersion || null,
          userAgent: userAgent || null,
          guestAccess: !!body.guestAccess,
          preview: !!body.preview,
          stack: stack || null,
          componentStack: componentStack || null,
        },
      });
      if (!error) stored = true;
      else console.log("[report-client-error] store", error.message);
    }
  } catch (e) {
    console.log("[report-client-error] store failed", e);
  }

  let emailed = false;
  let mailError: string | undefined;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `[Crash] ${message.slice(0, 80)}`,
          text,
        }),
      });
      if (res.ok) {
        emailed = true;
      } else {
        mailError = `resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
        console.log("[report-client-error]", mailError);
      }
    } catch (e) {
      mailError = e instanceof Error ? e.message : String(e);
      console.log("[report-client-error] mail failed", mailError);
    }
  }

  // Fallback when Resend isn't configured: FormSubmit posts to the support inbox.
  // First delivery to a new address may require a one-time confirmation click.
  if (!emailed) {
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _subject: `[Crash] ${message.slice(0, 80)}`,
          _template: "box",
          _captcha: "false",
          message: text,
          pathname: pathname || "(n/a)",
          platform: `${platform} ${platformVersion}`.trim(),
          role,
        }),
      });
      if (res.ok) {
        emailed = true;
        mailError = resendKey ? mailError : undefined;
      } else {
        const detail = (await res.text()).slice(0, 200);
        mailError = (mailError ? mailError + "; " : "") + `formsubmit ${res.status}: ${detail}`;
        console.log("[report-client-error] formsubmit", mailError);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      mailError = (mailError ? mailError + "; " : "") + detail;
      console.log("[report-client-error] formsubmit failed", detail);
    }
  }

  return new Response(
    JSON.stringify({ ok: emailed || stored, emailed, stored, mailError: mailError || null }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
