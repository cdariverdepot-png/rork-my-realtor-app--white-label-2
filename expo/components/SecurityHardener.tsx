/**
 * Previously enabled screenshot/recording prevention and iOS app-switcher
 * privacy blur. Disabled per product decision so users can freely capture
 * screenshots of the app for sharing/marketing.
 *
 * Sensitive credentials are still stored in the device Keychain / Keystore
 * via expo-secure-store inside AuthContext, and all network traffic uses
 * TLS by default.
 */
export default function SecurityHardener() {
  return null;
}
