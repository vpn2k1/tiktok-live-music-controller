import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Button from './Button';
import { isPairedPage, PHONE_LINK_PATH, t, type PhoneLink } from './shared';
import { colors } from './theme';

/** Wait between attempts while the computer can't be reached. */
const RETRY_MS = 3000;
const PROBE_TIMEOUT_MS = 4000;
/** Hold the top-left corner this long to open the menu. */
const HOLD_MS = 1200;

/** True when the computer's phone page answers (any HTTP answer counts; the page itself checks the code). */
async function reachable(link: PhoneLink): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${link.origin}${PHONE_LINK_PATH}`, { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The computer's /phone page full screen: no status / navigation bar, screen
 * kept on. The WebView only ever shows the paired page (no other navigation,
 * no popups) and gets no bridge to the app (no `onMessage`, no injected JS).
 */
export default function GameScreen({ link, onLeave }: { link: PhoneLink; onLeave: () => void }) {
  useKeepAwake();
  const [online, setOnline] = useState<boolean | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Show the page only once the computer answers, so a closed app gives a clear message instead of an error page.
  useEffect(() => {
    if (online) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      const ok = await reachable(link);
      if (cancelled) return;
      if (ok) setOnline(true);
      else timer = setTimeout(() => void attempt(), RETRY_MS);
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [link, online, frameKey]);

  // Android Back opens / closes the menu instead of leaving the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenuOpen((open) => !open);
      return true;
    });
    return () => subscription.remove();
  }, []);

  const reload = useCallback(() => {
    setMenuOpen(false);
    setOnline(null);
    setFrameKey((key) => key + 1);
  }, []);

  // The page failed to load (the computer went away before it loaded): wait for it again.
  const lost = useCallback(() => setOnline(false), []);

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <NavigationBar hidden />
      {online ? (
        <WebView
          key={frameKey}
          style={styles.web}
          source={{ uri: link.url }}
          onShouldStartLoadWithRequest={(request) => isPairedPage(request.url, link)}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowsBackForwardNavigationGestures={false}
          allowFileAccess={false}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          bounces={false}
          overScrollMode="never"
          scrollEnabled={false}
          onError={lost}
          onHttpError={lost}
        />
      ) : (
        <View style={styles.status}>
          <Text style={styles.statusText}>
            {online === null
              ? t('Đang kết nối tới máy tính {address}…', { address: link.address })
              : t('Không kết nối được máy tính {address}. Kiểm tra app trên máy tính đã bật màn hình điện thoại và hai máy cùng Wi-Fi. Đang tự thử lại…', { address: link.address })}
          </Text>
          <Button label={t('Đổi máy tính')} onPress={onLeave} />
        </View>
      )}
      {/* Invisible hold area for the menu (small, so it doesn't block the game). */}
      <Pressable style={styles.corner} delayLongPress={HOLD_MS} onLongPress={() => setMenuOpen(true)} accessibilityLabel={t('Menu')} />
      {menuOpen ? (
        <View style={styles.menu} accessibilityViewIsModal>
          <Button primary label={t('🔄 Tải lại')} onPress={reload} />
          <Button label={t('Đổi máy tính')} onPress={onLeave} />
          <Button label={t('Đóng')} onPress={() => setMenuOpen(false)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  web: { flex: 1, backgroundColor: colors.background },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  statusText: { color: '#c9d1de', fontSize: 16, lineHeight: 22, textAlign: 'center', maxWidth: 480 },
  corner: { position: 'absolute', top: 0, left: 0, width: 56, height: 56 },
  menu: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,13,18,.92)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }
});
