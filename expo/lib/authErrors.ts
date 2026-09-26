/** Never expose database names, queries, or provider diagnostics to customers. */
export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  switch (code) {
    case "invalid_credentials": return "The email or password isn't correct. Try again or reset your password.";
    case "email_not_confirmed": return "Please confirm your email before signing in.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Too many requests. Please wait a few minutes before trying again.";
    case "user_already_exists": return "Try signing in instead, or reset your password.";
    case "weak_password": return "Please choose a stronger password.";
    case "email_address_invalid": return "Please enter a valid email address.";
    case "otp_expired": return "That confirmation has expired. Please request a new one.";
    case "PGRST202": return "We couldn't finish opening your account. Our account service needs an update. Please try again later; you don't need to create another account.";
    default: return "We couldn't complete that request. Please try again shortly.";
  }
}
