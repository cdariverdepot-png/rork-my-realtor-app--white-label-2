import { Alert, Linking, Platform } from "react-native";

/** Shared consultation contact details. Uses realtor brand info when available. */
export interface ConsultInfo {
  phoneDisplay: string;
  phoneTel: string;
  email: string;
  firstName: string;
}

const DEFAULT_INFO: ConsultInfo = {
  phoneDisplay: "(208) 210-8717",
  phoneTel: "+12082108717",
  email: "contact@myrealtorapp.com",
  firstName: "your realtor",
};

let activeInfo: ConsultInfo = { ...DEFAULT_INFO };

export function setConsultInfo(info: Partial<ConsultInfo>): void {
  activeInfo = { ...DEFAULT_INFO, ...info };
}

export function getConsultInfo(): ConsultInfo {
  return activeInfo;
}

async function tryOpen(url: string, fallbackTitle: string, fallbackMsg: string): Promise<void> {
  try {
    const ok = await Linking.canOpenURL(url);
    if (ok) {
      await Linking.openURL(url);
    } else {
      Alert.alert(fallbackTitle, fallbackMsg);
    }
  } catch (e) {
    console.log("[contact] open failed", url, e);
    Alert.alert(fallbackTitle, fallbackMsg);
  }
}

/** Call to book a consultation. */
export function consultCall(): Promise<void> {
  const { phoneTel, phoneDisplay } = activeInfo;
  return tryOpen(
    `tel:${phoneTel}`,
    "Call to book",
    `Reach out at ${phoneDisplay} to schedule your consultation.`
  );
}

/** Text to book a consultation. */
export function consultText(): Promise<void> {
  const { phoneTel, phoneDisplay, firstName } = activeInfo;
  const body = encodeURIComponent(
    `Hi ${firstName}, I'd love to book a consultation. When works for you?`
  );
  const sep = Platform.OS === "ios" ? "&" : "?";
  return tryOpen(
    `sms:${phoneTel}${sep}body=${body}`,
    "Text to book",
    `Send a text to ${phoneDisplay} to schedule your consultation.`
  );
}

/** Email to book a consultation. */
export function consultEmail(): Promise<void> {
  const { email, firstName } = activeInfo;
  const subject = encodeURIComponent("Consultation request");
  const body = encodeURIComponent(
    [
      `Hi ${firstName},`,
      "",
      "I'd love to book a consultation. Here's what I'm looking for:",
      "",
      "Preferred days / times:",
      "",
      "—",
    ].join("\n")
  );
  return tryOpen(
    `mailto:${email}?subject=${subject}&body=${body}`,
    "Email not available",
    `Please write to ${email}.`
  );
}

/**
 * Present the standard "Book a consultation" chooser so the client can reach
 * out however they prefer — call, text, or email. Used by surfaces that only
 * have room for a single button (footer, dashboard support row).
 */
export function bookConsultation(): void {
  const { phoneDisplay } = activeInfo;
  Alert.alert(
    "Book a consultation",
    "How would you like to get in touch?",
    [
      { text: `Call ${phoneDisplay}`, onPress: () => { void consultCall(); } },
      { text: "Text", onPress: () => { void consultText(); } },
      { text: "Email", onPress: () => { void consultEmail(); } },
      { text: "Cancel", style: "cancel" },
    ],
    { cancelable: true }
  );
}
