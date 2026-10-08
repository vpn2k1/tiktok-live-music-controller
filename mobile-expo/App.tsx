import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import GameScreen from './src/GameScreen';
import PairingScreen from './src/PairingScreen';
import { setLanguage, type PhoneLink } from './src/shared';
import { loadLink, saveLink } from './src/storage';
import { colors } from './src/theme';

// The phone's own language: English phones get English, everything else Vietnamese.
setLanguage(Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('en') ? 'en' : 'vi');

/**
 * Phone app (Expo): pair with the desktop app by its QR code, then show its
 * game screen (/phone) full screen for a TikTok screen-share LIVE.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState<PhoneLink | null>(null);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    void loadLink().then((saved) => {
      setLink(saved);
      // A paired phone opens straight on the game screen.
      setShowing(saved != null);
      setReady(true);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!ready ? <View style={{ flex: 1, backgroundColor: colors.background }} />
        : showing && link ? <GameScreen link={link} onLeave={() => setShowing(false)} />
          : (
            <PairingScreen
              saved={link}
              onOpen={() => setShowing(true)}
              onPaired={(next) => {
                void saveLink(next);
                setLink(next);
                setShowing(true);
              }}
            />
          )}
    </SafeAreaProvider>
  );
}
