export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, "myrealtorapp://");
    const code = url.hostname === "code" ? url.pathname.slice(1) : url.pathname.match(/^\/code\/([^/]+)$/)?.[1];
    if (code && /^[a-z0-9]{6}$/i.test(code)) return `/portal?entry=client&invite=${encodeURIComponent(code)}`;
    // Everything else (auth/callback, reset-password, portal…) routes normally.
    return path;
  } catch { return "/"; }
}
