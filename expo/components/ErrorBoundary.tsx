import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { brand, fonts } from "@/constants/colors";

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  /** Bumped on retry so the subtree remounts from scratch. */
  attempt: number;
  copied: boolean;
};

/**
 * App-wide error boundary.
 *
 * Without one, a single bad render anywhere unmounts the whole tree and leaves
 * a white screen with no route back and no way for the user to tell us what
 * happened. This catches the throw, keeps the app's own voice, and offers the
 * two things that actually help: try again, and copy the details to send over.
 *
 * Retry works by remounting the subtree under a new key. That clears transient
 * failures (a bad fetch result, a malformed cached record) without a full app
 * restart. A genuinely broken screen will simply throw again and land back
 * here, which is the honest outcome.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, attempt: 0, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Sanitised: message and stack only, never app state or user records.
    console.log("[boundary] caught", error.message, info.componentStack?.slice(0, 800));
  }

  private retry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1, copied: false }));
  };

  private copy = async (): Promise<void> => {
    const { error } = this.state;
    if (!error) return;
    const report = [
      `Message: ${error.message}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `When: ${new Date().toISOString()}`,
      "",
      (error.stack ?? "").slice(0, 2000),
    ].join("\n");
    try {
      await Clipboard.setStringAsync(report);
      this.setState({ copied: true });
    } catch (e) {
      console.log("[boundary] copy failed", e);
    }
  };

  render(): React.ReactNode {
    const { error, attempt, copied } = this.state;

    if (!error) {
      return <React.Fragment key={attempt}>{this.props.children}</React.Fragment>;
    }

    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rule} />
          <Text style={styles.eyebrow}>SOMETHING BROKE</Text>
          <Text style={styles.title}>This screen didn&apos;t load.</Text>
          <Text style={styles.body}>
            Your listings, clients and brand are all saved — nothing has been lost. This is a
            fault in the app itself, not in your account.
          </Text>

          <View style={styles.detail}>
            <Text style={styles.detailLabel}>WHAT WENT WRONG</Text>
            <Text style={styles.detailText} numberOfLines={6}>
              {error.message || "Unknown error"}
            </Text>
          </View>

          <Pressable
            onPress={this.retry}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.primaryText}>TRY AGAIN</Text>
          </Pressable>

          <Pressable
            onPress={this.copy}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Copy error details"
          >
            <Text style={styles.secondaryText}>
              {copied ? "COPIED — SEND IT TO SUPPORT" : "COPY DETAILS"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0B0C" },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 60 },
  rule: { width: 34, height: 1, backgroundColor: brand.gold, marginBottom: 22 },
  eyebrow: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.6,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  body: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.62)",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 26,
  },
  detail: {
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.14)",
    backgroundColor: "rgba(244,239,230,0.04)",
    padding: 14,
    marginBottom: 26,
    gap: 7,
  },
  detailLabel: {
    fontFamily: fonts.sansSemi,
    color: "rgba(244,239,230,0.42)",
    fontSize: 9,
    letterSpacing: 1.8,
  },
  detailText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "rgba(244,239,230,0.78)",
    fontSize: 11.5,
    lineHeight: 17,
  },
  primary: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.55)",
    backgroundColor: "rgba(210,163,67,0.14)",
    marginBottom: 12,
  },
  primaryText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 2.4,
  },
  secondary: { height: 46, alignItems: "center", justifyContent: "center" },
  secondaryText: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.5)",
    fontSize: 10.5,
    letterSpacing: 1.8,
  },
});
