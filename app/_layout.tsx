import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { LanguageProvider } from '@/context/LanguageContext';

// アプリ起動時に Cloudflare Workers をウォームアップ（コールドスタート対策）
const WORKER_BASE = "https://namenature-api.picturepicture773.workers.dev";
function warmupWorker() {
  fetch(`${WORKER_BASE}/api/health`, { method: "GET" }).catch(() => {});
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // アプリ起動時に Worker をウォームアップ
  useEffect(() => {
    warmupWorker();
  }, []);

  return (
    <LanguageProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="kaiseki" options={{ headerShown: false }} />
          <Stack.Screen name="zukan" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </LanguageProvider>
  );
}
