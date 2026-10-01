import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import PortraitImage from "./PortraitImage";
import { useRouter } from "expo-router";
import { Phone, MessageSquare, CalendarDays } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { avatarPlaceholder } from "@/constants/assets";
import { useBrand } from "@/contexts/BrandContext";
import PressableScale from "./PressableScale";

export default function QuickContact() {
  const router = useRouter();
  const { brand: b, theme } = useBrand();
  const realtor = b.realtor;
  const filled = (s: string | undefined): boolean => (s ?? "").trim().length > 0;
  const firstName = (realtor.name.split(" ")[0] ?? realtor.name).trim();
  // The stock line ends "{first} writes back personally" — without a name that
  // reads as a broken sentence, so it shifts to first person instead.
  const subText = firstName
    ? b.quickContact.sub.replace("{first}", firstName)
    : b.quickContact.sub.replace("{first} writes", "I write").replace("{first}", "I");

  type Action = {
    key: string;
    label: string;
    sub: string;
    Icon: typeof Phone;
    tint: string;
    bg: string;
    border: string;
    onPress: () => void;
  };

  const actions: Action[] = [
    {
      key: "msg",
      label: "Message",
      sub: "Replies same day",
      Icon: MessageSquare,
      tint: theme.band.base,
      bg: theme.surface.panel,
      border: theme.surface.hairline,
      onPress: () => router.push("/message"),
    },
    // A call row with no number dials nothing, so it only exists with a phone.
    ...(filled(realtor.phone)
      ? ([
          {
            key: "call",
            label: "Call",
            sub: realtor.phone,
            Icon: Phone,
            tint: theme.accent.deep,
            bg: theme.surface.panel,
            border: theme.surface.hairline,
            onPress: () =>
              Linking.openURL(`tel:${realtor.phone.replace(/[^0-9+]/g, "")}`).catch(() => {}),
          },
        ] as Action[])
      : []),
    {
      key: "book",
      label: "Book showing",
      sub: "Private viewing",
      Icon: CalendarDays,
      tint: theme.accent.base,
      bg: theme.surface.panel,
      border: theme.surface.hairline,
      onPress: () => router.push("/book"),
    },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        {b.portraitUrl ? (
          <PortraitImage
            uri={b.portraitUrl}
            style={[styles.avatar, { borderColor: theme.accent.base }]}
            contentFit="cover"
          />
        ) : (
          <View
            style={[styles.avatar, styles.avatarFallback, { borderColor: theme.accent.base }]}
          >
            <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {filled(b.quickContact.kicker) ? (
            <Text style={styles.kicker}>{b.quickContact.kicker}</Text>
          ) : null}
          <Text style={styles.title}>
            {filled(b.quickContact.title) ? b.quickContact.title : "Reach me directly."}
          </Text>
          {filled(subText) ? <Text style={styles.sub}>{subText}</Text> : null}
        </View>
      </View>

      <View style={styles.grid}>
        {actions.map(({ key, label, sub, Icon, tint, bg, border, onPress }) => (
          <PressableScale
            key={key}
            onPress={onPress}
            haptic="light"
            scaleTo={0.98}
            style={[styles.action, { backgroundColor: bg, borderColor: border }]}
          >
            <View style={[styles.iconBubble, { backgroundColor: tint }]}>
              <Icon size={18} color={brand.ivory} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>{label}</Text>
              <Text style={styles.actionSub}>{sub}</Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 24,
    paddingTop: 52,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: brand.gold,
  },
  avatarFallback: {
    backgroundColor: "#07070A",
    overflow: "hidden",
  },
  kicker: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 24,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 4,
  },
  grid: { gap: 6 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: brand.paper,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: fonts.sansSemi,
    color: brand.ink,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  actionSub: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
