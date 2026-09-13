import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useListings } from "@/contexts/ListingsContext";
import { useClients } from "@/contexts/ClientsContext";
import { useCalendarFeeds } from "@/contexts/CalendarFeedsContext";
import { useDocuments } from "@/contexts/DocumentsContext";
import { DEFAULT_THEME } from "@/constants/theme";
import { requiredStatus, type RequiredFieldId } from "@/constants/sections";

/**
 * GoLiveContext — the realtor's onboarding checklist.
 *
 * Nothing here blocks navigation. The checklist purely *reflects* the state of
 * the account and nudges toward whatever is still missing. Every item maps to a
 * concrete, verifiable piece of saved data, so the percentage recomputes the
 * moment anything is saved anywhere in the app.
 *
 * Items come in two tiers. **Required** items are the floor defined in
 * `constants/sections` — without them the client app either cannot function or
 * cannot legally advertise. **Optional** items are polish: worth doing, never
 * blocking. Treating "set your name" and "link your documents" as equal tenths
 * of a single number told the realtor nothing about what actually stood between
 * them and a working app.
 */

export type GoLiveItemId =
  | "displayName"
  | "portrait"
  | "city"
  | "contact"
  | "heroCopy"
  | "license"
  | "appIcon"
  | "brandColors"
  | "listing"
  | "client"
  | "clientData"
  | "calendar"
  | "documents";

/** Required-floor fields, mapped onto checklist ids and asked in this order. */
const FIELD_TO_ITEM: Record<RequiredFieldId, GoLiveItemId> = {
  name: "displayName",
  portrait: "portrait",
  city: "city",
  contact: "contact",
  heroLine: "heroCopy",
  license: "license",
};

const REQUIRED_ORDER: RequiredFieldId[] = [
  "name",
  "portrait",
  "city",
  "contact",
  "heroLine",
  "license",
];

const REQUIRED_CTA: Record<RequiredFieldId, string> = {
  name: "Set your display name",
  portrait: "Add your portrait",
  city: "Set your city or region",
  contact: "Add a phone or email",
  heroLine: "Write your opening line",
  license: "Add your brokerage & licence",
};

export type GoLiveItem = {
  id: GoLiveItemId;
  /** Short label for the checklist row. */
  label: string;
  /** Imperative nudge used on the card's action button. */
  cta: string;
  /** One-line explanation of why it matters. */
  hint: string;
  done: boolean;
  href: string;
  /** Required items gate publishing; optional ones never do. */
  required: boolean;
  /** First time this item was satisfied, if ever. */
  completedAt?: number;
};

/** Durable record of checklist progress. */
export type GoLiveRecord = {
  percent: number;
  completedIds: GoLiveItemId[];
  /** Timestamps of when each item was first satisfied. */
  completedAt: Partial<Record<GoLiveItemId, number>>;
  /** When the profile first reached 100%. */
  liveAt?: number;
  updatedAt: number;
};

/** Contact-book sources that represent a real client-data upload/import. */
const IMPORT_SOURCES = new Set(["csv", "vcard", "google", "outlook", "apple", "linkedin", "phone"]);

const STORAGE_PREFIX = "golive.record.v1";
const storageKey = (realtorId: string | null | undefined): string =>
  `${STORAGE_PREFIX}:${realtorId ?? "anon"}`;

const emptyRecord = (): GoLiveRecord => ({
  percent: 0,
  completedIds: [],
  completedAt: {},
  updatedAt: Date.now(),
});

export const [GoLiveProvider, useGoLive] = createContextHook(() => {
  const { realtorId, demoViewMode } = useAuth();
  const { brand, hydrated: brandHydrated } = useBrand();
  const { all: listings } = useListings();
  const { clients } = useClients();
  const { feeds } = useCalendarFeeds();
  const { items: documents } = useDocuments();

  const [record, setRecord] = useState<GoLiveRecord>(emptyRecord);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const recordRef = useRef<GoLiveRecord>(record);
  recordRef.current = record;

  // ── Hydrate the durable record ──
  useEffect(() => {
    let mounted = true;
    setHydrated(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(realtorId));
        if (mounted && raw) {
          const parsed = JSON.parse(raw) as Partial<GoLiveRecord>;
          setRecord({
            percent: typeof parsed.percent === "number" ? parsed.percent : 0,
            completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
            completedAt: parsed.completedAt ?? {},
            liveAt: parsed.liveAt,
            updatedAt: parsed.updatedAt ?? Date.now(),
          });
        } else if (mounted) {
          setRecord(emptyRecord());
        }
      } catch (e) {
        console.log("[golive] hydrate failed", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [realtorId]);

  // ── Derive the live checklist from real saved state ──
  const items: GoLiveItem[] = useMemo(() => {
    const themeTouched =
      brand.theme.accent !== DEFAULT_THEME.accent || brand.theme.displayFont !== DEFAULT_THEME.displayFont;

    // The required tier is derived straight from the client-side rule set, so
    // the checklist and the app itself can never disagree about what "ready"
    // means — one definition, read from both sides.
    const req = requiredStatus(brand);
    const byId = new Map(req.met.concat(req.missing).map((f) => [f.id, f]));
    const requiredDefs: Omit<GoLiveItem, "completedAt">[] = REQUIRED_ORDER.flatMap((fid) => {
      const f = byId.get(fid);
      if (!f) return [];
      return [
        {
          id: FIELD_TO_ITEM[fid],
          label: f.label,
          cta: REQUIRED_CTA[fid],
          hint: f.why,
          done: f.met(brand),
          href: f.href,
          required: true,
        },
      ];
    });

    const defs: Omit<GoLiveItem, "completedAt">[] = [
      ...requiredDefs,
      {
        id: "brandColors",
        label: "Theme",
        cta: "Choose your theme",
        hint: "Your accent and display typeface.",
        done: themeTouched,
        href: "/admin/studio?section=theme",
        required: false,
      },
      {
        id: "listing",
        label: "First listing",
        cta: "Add your first listing",
        hint: "Add a listing to show your property collection to clients.",
        done: listings.length > 0,
        href: "/admin/add",
        required: false,
      },
      {
        id: "client",
        label: "First client",
        cta: "Add your first client",
        hint: "Someone to share the app with.",
        done: clients.length > 0,
        href: "/admin/clients",
        required: false,
      },
      {
        id: "clientData",
        label: "Client data uploaded",
        cta: "Upload your client list",
        hint: "Import contacts so nobody gets missed.",
        done: clients.some((c) => c.source !== undefined && IMPORT_SOURCES.has(c.source)),
        href: "/admin/clients-import",
        required: false,
      },
      {
        id: "calendar",
        label: "Calendar linked",
        cta: "Link your calendar",
        hint: "Showings land straight in your schedule.",
        done: feeds.length > 0,
        href: "/admin/calendar-import",
        required: false,
      },
      {
        id: "documents",
        label: "Documents linked",
        cta: "Link your documents",
        hint: "Contracts and disclosures in one place.",
        done: documents.length > 0,
        href: "/admin/documents",
        required: false,
      },
    ];

    return defs.map((d) => ({ ...d, completedAt: record.completedAt[d.id] }));
  }, [brand, listings.length, clients, feeds.length, documents.length, record.completedAt]);

  const doneCount = useMemo(() => items.filter((i) => i.done).length, [items]);
  const percent = useMemo(
    () => (items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100)),
    [doneCount, items.length]
  );
  const isLive = doneCount === items.length && items.length > 0;

  /** The next thing worth doing — required work always jumps the queue. */
  const nextItem = useMemo(
    () => items.find((i) => i.required && !i.done) ?? items.find((i) => !i.done),
    [items]
  );
  const remaining = useMemo(() => items.filter((i) => !i.done), [items]);

  const requiredItems = useMemo(() => items.filter((i) => i.required), [items]);
  const optionalItems = useMemo(() => items.filter((i) => !i.required), [items]);
  const missingRequired = useMemo(() => requiredItems.filter((i) => !i.done), [requiredItems]);
  /** True once the client app has everything it needs to function and comply. */
  const canPublish = missingRequired.length === 0;

  // ── Persist whenever derived progress changes ──
  useEffect(() => {
    // Never write progress for the frozen demo showcase, and never write before
    // both the stored record and the brand itself have hydrated (that would
    // stamp completion timestamps against placeholder data).
    if (demoViewMode || !hydrated || !brandHydrated) return;

    const prev = recordRef.current;
    const completedIds = items.filter((i) => i.done).map((i) => i.id);
    const now = Date.now();

    const completedAt: Partial<Record<GoLiveItemId, number>> = { ...prev.completedAt };
    let changed = false;
    for (const id of completedIds) {
      if (completedAt[id] === undefined) {
        completedAt[id] = now;
        changed = true;
      }
    }
    // Drop stamps for anything that regressed (e.g. the last listing removed).
    for (const key of Object.keys(completedAt) as GoLiveItemId[]) {
      if (!completedIds.includes(key)) {
        delete completedAt[key];
        changed = true;
      }
    }

    const liveAt = isLive ? prev.liveAt ?? now : undefined;
    if (!changed && prev.percent === percent && prev.liveAt === liveAt) return;

    const next: GoLiveRecord = { percent, completedIds, completedAt, liveAt, updatedAt: now };
    setRecord(next);
    AsyncStorage.setItem(storageKey(realtorId), JSON.stringify(next)).catch((e) =>
      console.log("[golive] persist failed", e)
    );
  }, [items, percent, isLive, hydrated, brandHydrated, demoViewMode, realtorId]);

  const reset = useCallback(() => {
    const fresh = emptyRecord();
    setRecord(fresh);
    AsyncStorage.removeItem(storageKey(realtorId)).catch((e) => console.log("[golive] reset failed", e));
  }, [realtorId]);

  return useMemo(
    () => ({
      items,
      percent,
      doneCount,
      totalCount: items.length,
      isLive,
      nextItem,
      remaining,
      requiredItems,
      optionalItems,
      missingRequired,
      canPublish,
      record,
      hydrated,
      reset,
    }),
    [
      items,
      percent,
      doneCount,
      isLive,
      nextItem,
      remaining,
      requiredItems,
      optionalItems,
      missingRequired,
      canPublish,
      record,
      hydrated,
      reset,
    ]
  );
});
