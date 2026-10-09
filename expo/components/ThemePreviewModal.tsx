import Pressable from './TactilePressable';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Platform, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import ThemePreviewPage from './ThemePreviewPage';
import { clientDestination } from '@/lib/clientNavigation';
import { previewDestination, previousPreviewPage } from '@/lib/previewHistory';
import { claimPop, historyLayers } from '@/lib/builderHistory';
import { PreviewSandboxProvider } from './PreviewSandbox';
import { liveThemeDesign } from '@/constants/liveThemeDesigns';

/**
 * Full-screen, read-only theme preview. Leave with the Back button (top left)
 * or by swiping right — the screen follows the finger and slides away.
 */
export default function ThemePreviewModal({ visible, title, subtitle, note, brand, listings, portraitSource, initialRoute = "/", onClose, browserHistory = false }: {
  visible: boolean; title: string; subtitle?: string; note?: string;
  brand: Brand; listings: ManagedListing[]; portraitSource?: number; initialRoute?:string; onClose: () => void;
  /**
   * Make the preview's pages browser history entries (web), so the browser's Back and Safari's edge swipe step
   * through the preview instead of leaving the screen underneath. Used where the screen underneath is verified to
   * keep its state across those history steps (the app builder's review). Elsewhere (the dashboard) a history step
   * made the router remount the screen, which closed the preview and left the dashboard, so it is off there.
   */
  browserHistory?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const [sliding, setSliding] = useState(false);
  const [page, setPage] = useState('/');
  const history = useRef<string[]>([]);
  const pageOffsets = useRef(new Map<string, number>());
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const toggleSaved = (id: string) => setSavedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const showPage = (path: string) => {
    setPage(path);
    const offset = pageOffsets.current.get(path) ?? 0;
    scrollY.setValue(offset);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: offset, animated: false }));
  };
  /**
   * On the web (including the iPhone preview in Safari) the browser's Back button and the edge swipe walk the
   * browser history. Each preview page is a history entry, so Back steps through the preview and finally closes
   * it, instead of leaving the app builder behind the preview.
   */
  const webEntries = useRef(0);
  const ignorePops = useRef(0);
  const web = browserHistory && Platform.OS === "web" && typeof window !== "undefined" && !!window.history;
  // Set while the preview itself is being removed (its screen left or remounted): its history entries are then left
  // in place, because walking back from a screen that is going away would leave the page.
  const unmounting = useRef(false);
  useEffect(() => () => { unmounting.current = true; }, []);
  const navigate = (path: string) => {
    const destination = clientDestination(path, true);
    if (destination === page) return;
    if (web) { window.history.pushState({ ...(window.history.state ?? {}), clientPreview: page }, ""); webEntries.current++; }
    showPage(previewDestination(history.current, page, destination));
  };

  const close = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    onClose();
  };
  const stepBack = () => {
    const previous = previousPreviewPage(history.current);
    if (previous !== null) showPage(previous);
    else close();
  };
  // The on-screen Back and the swipe follow the same history as the browser's Back.
  const back = () => { if (web && webEntries.current > 0) window.history.back(); else stepBack(); };
  const stepBackRef = useRef(stepBack);
  stepBackRef.current = stepBack;
  useEffect(() => {
    if (!web || !visible) return;
    window.history.pushState({ ...(window.history.state ?? {}), clientPreview: "open" }, "");
    webEntries.current = 1;
    // A history layer above whatever opened the preview (the app builder's review): its pops are the preview's.
    historyLayers.open();
    // Every pop while the preview is open is the preview's: handled here and kept from the router, which would
    // otherwise reset the screen underneath to an older recorded state (lib/builderHistory).
    const onPop = (event: PopStateEvent) => {
      claimPop(event);
      if (ignorePops.current > 0) { ignorePops.current--; return; }
      if (webEntries.current > 0) webEntries.current--;
      stepBackRef.current();
    };
    window.addEventListener("popstate", onPop, true);
    return () => {
      window.removeEventListener("popstate", onPop, true);
      historyLayers.close();
      // Closed some other way: drop the preview's remaining history entries without leaving the page. That pop
      // is the preview's too, so it is kept from the router as well.
      if (webEntries.current > 0 && !unmounting.current) {
        const n = webEntries.current; webEntries.current = 0;
        const swallow = (event: PopStateEvent) => { claimPop(event); window.removeEventListener("popstate", swallow, true); };
        window.addEventListener("popstate", swallow, true);
        window.history.go(-n);
      }
    };
  }, [visible, web]);
  const swipeBack = useMemo(() => Gesture.Pan()
    .activeOffsetX(24)
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onTouchesDown((e, manager) => { const touch = e.allTouches[0]; if (!touch || touch.x > 32) manager.fail(); })
    .onStart(() => setSliding(true))
    .onUpdate(e => dragX.setValue(Math.max(0, e.translationX)))
    .onEnd(e => {
      if (e.translationX > windowWidth * 0.28 || e.velocityX > 700) {
        Animated.timing(dragX, { toValue: windowWidth, duration: 170, useNativeDriver: true }).start(() => {
          back();
          dragX.setValue(0);
          setSliding(false);
        });
      } else {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 220 }).start(() => setSliding(false));
      }
    })
    .onFinalize((_e, success) => { if (!success) { dragX.setValue(0); setSliding(false); } }), [windowWidth, page, onClose]);

  const previewWidth = Math.min(windowWidth, 390);
  const previewBackground = liveThemeDesign(brand.layoutId, brand.theme).background;
  // Create the scroll binding once — recreating Animated.event each render can thrash native bindings.
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true,
      listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => pageOffsets.current.set(page, event.nativeEvent.contentOffset.y) }),
    [scrollY, page],
  );
  useEffect(() => {
    if (visible) { const destination = clientDestination(initialRoute,true); history.current = destination === '/' ? [] : ['/']; pageOffsets.current.clear(); setPage(destination); setSavedIds([]); scrollY.setValue(0); scrollRef.current?.scrollTo({ y: 0, animated: false }); }
  }, [visible, brand.layoutId, scrollY, initialRoute]);

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={back}>
    <PreviewSandboxProvider key={visible ? 'open' : 'closed'}><GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={swipeBack}>
        <Animated.View style={[{ flex: 1, backgroundColor: "#111713" }, sliding ? { transform: [{ translateX: dragX }] } : undefined]}>
          <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 6, paddingRight: 12, paddingVertical: 8,
                borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <ChevronLeft size={18} color="#F5EFE5" strokeWidth={2.2} />
              <Text style={{ color: "#F5EFE5", fontSize: 15, fontWeight: "600" }}>Back</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: "#F5EFE5", fontSize: 15 }}>{title}</Text>
              {subtitle ? <Text numberOfLines={1} style={{ color: "#A9A294", fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
            </View>
          </View>
          <Animated.ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            overScrollMode="never"
            bounces={false}
            alwaysBounceVertical={false}
            // Avoid recycling the hero offscreen — remounts looked like whole-page blinks.
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 116 + insets.bottom }}
            style={Platform.OS === "web" ? ({ overscrollBehaviorY: "none" } as object) : undefined}
          >
            <View style={{ maxWidth: 390, width: "100%", alignSelf: "center", overflow: "hidden", backgroundColor: previewBackground, minHeight: 640 }}>
              {page === '/' ? <ReferenceHome brand={brand} portraitSource={portraitSource} listings={listings} width={previewWidth} scrollY={scrollY} onNavigate={navigate}
                onOpen={id => navigate(`/listing/${id}`)} onFavorite={toggleSaved} isFavorite={id => savedIds.includes(id)}
                onCall={() => navigate('/message')} onContact={() => navigate('/message')} /> :
                <ThemePreviewPage route={page} brand={brand} listings={listings} onNavigate={navigate} savedIds={savedIds} onFavorite={toggleSaved} width={previewWidth} />}
            </View>
            {note ? <Text style={{ color: "#C5BDAF", padding: 24, textAlign: "center", lineHeight: 21 }}>{note}</Text> : null}
          </Animated.ScrollView>
          <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 0, width: "100%", maxWidth: 390, alignSelf: "center", paddingBottom: insets.bottom }}><ThemeNavigation brand={brand} preview pathname={page} onNavigate={navigate} saved={savedIds.length} /></View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView></PreviewSandboxProvider>
  </Modal>;
}

