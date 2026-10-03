import React from 'react';
import { View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBrand } from '@/contexts/BrandContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useMessages } from '@/contexts/MessagesContext';
import { useAuth } from '@/contexts/AuthContext';
import { clientDestination } from '@/lib/clientNavigation';
import ThemeNavigation from './ThemeNavigation';
export const BOTTOM_NAV_HEIGHT = 86;
export default function BottomNav({ embedded = false }: { embedded?: boolean }) {
  const router=useRouter(), pathname=usePathname(), insets=useSafeAreaInsets();
  const {brand}=useBrand(), {isAdmin,viewAsClient,isClient}=useAuth(), {totalFavorites}=useFavorites(), {messages}=useMessages();
  const preview=isAdmin && viewAsClient;
  const unread=isClient ? messages.filter(m=>m.role==='realtor' && !m.read).length : 0;
  return <View pointerEvents="box-none" style={{ ...(embedded ? {} : {position:'absolute' as const,bottom:0,left:0,right:0}), paddingBottom:insets.bottom }}>
    <ThemeNavigation brand={brand} pathname={pathname} preview={preview} unread={unread} saved={totalFavorites} onNavigate={path=>{
      const destination=clientDestination(path,preview);
      if(destination!==pathname) router.navigate(destination as never);
    }} />
  </View>;
}
