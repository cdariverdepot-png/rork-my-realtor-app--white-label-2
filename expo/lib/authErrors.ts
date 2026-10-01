/** Never expose database names, queries, raw JSON, or provider diagnostics to customers. */
export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  // Supabase authorize failures often arrive as JSON blobs or validation_failed.
  if (
    code === "validation_failed" ||
    /provider is not enabled|unsupported provider|validation_failed/i.test(message) ||
    /^\s*\{/.test(message) ||
    /"error_code"\s*:/.test(message)
  ) {
    return "That sign-in provider isn't connected yet. Use email and password, or ask your admin to add Google, Microsoft, or Apple in Supabase Auth.";
  }
  // Supabase's built-in mailer refuses non-team addresses and fails hard when
  // custom SMTP is misconfigured. Say so plainly instead of a generic error.
  if (code === "email_address_not_authorized" || /not authorized/i.test(message)) {
    return "We couldn't send email to this address yet. Please try again later or contact support.";
  }
  if (/error sending .*email|sending (confirmation|recovery|magic link)/i.test(message)) {
    return "We couldn't send the email right now. Please try again in a few minutes.";
  }
  switch (code) {
    case "invalid_credentials": return "The email or password isn't correct. Try again or reset your password.";
    case "email_not_confirmed": return "Please confirm your email before signing in.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Too many requests. Please wait a few minutes before trying again.";
    case "user_already_exists":
    case "email_exists": return "Try signing in instead, or reset your password.";
    case "weak_password": return "Please choose a stronger password.";
    case "email_address_invalid": return "Please enter a valid email address.";
    case "otp_expired": return "That confirmation has expired. Please request a new one.";
    case "PGRST202": return "We couldn't finish opening your account. Our account service needs an update. Please try again later; you don't need to create another account.";
    default: return "We couldn't complete that request. Please try again shortly.";
  }
}
