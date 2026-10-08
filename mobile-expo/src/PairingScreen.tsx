import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from './Button';
import { parsePhoneLink, t, type PhoneLink } from './shared';
import { colors } from './theme';

/** After a bad QR code, wait before reading the next one (the camera keeps firing). */
const SCAN_PAUSE_MS = 1500;

interface Props {
  saved: PhoneLink | null;
  onPaired: (link: PhoneLink) => void;
  onOpen: () => void;
}

export default function PairingScreen({ saved, onPaired, onOpen }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pausedUntil = useRef(0);

  function accept(raw: string): boolean {
    const link = parsePhoneLink(raw);
    if (!link) {
      setError(t('Link không hợp lệ. Hãy quét mã QR trong panel 📱 LIVE bằng điện thoại trên máy tính.'));
      return false;
    }
    setError(null);
    setScanning(false);
    onPaired(link);
    return true;
  }

  function onScanned(result: BarcodeScanningResult): void {
    const now = Date.now();
    if (now < pausedUntil.current) return;
    if (!accept(result.data)) pausedUntil.current = now + SCAN_PAUSE_MS;
  }

  async function startScan(): Promise<void> {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) {
      setError(t('Không mở được camera: {error}', { error: t('chưa cho phép dùng camera') }));
      return;
    }
    setError(null);
    setScanning(true);
  }

  if (scanning) {
    return (
      <View style={styles.scanner}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
        <SafeAreaView style={styles.scanOverlay}>
          <Text style={styles.scanText}>{t('Đưa mã QR trên máy tính vào khung')}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={t('Huỷ')} onPress={() => setScanning(false)} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('📱 Màn hình LIVE')}</Text>
        <Text style={styles.lead}>{t('Hiện màn game từ app TikLiveVPN trên máy tính, toàn màn hình, để LIVE bằng chế độ chia sẻ màn hình của TikTok.')}</Text>

        {saved ? (
          <View style={styles.card}>
            <Text style={styles.text}>{t('Máy tính đã ghép nối: {address}', { address: saved.address })}</Text>
            <Button primary label={t('▶ Mở màn game')} onPress={onOpen} />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.step}>1. {t('Cho điện thoại vào cùng mạng Wi-Fi với máy tính.')}</Text>
          <Text style={styles.step}>2. {t('Trên máy tính: TikLiveVPN → panel 📱 LIVE bằng điện thoại → Bật màn hình điện thoại.')}</Text>
          <Text style={styles.step}>3. {t('Quét mã QR hiện trên máy tính.')}</Text>
          <Button primary label={t('📷 Quét mã QR')} onPress={() => void startScan()} />
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="http://192.168.x.x:17322/phone#k=…"
              placeholderTextColor="#596477"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel={t('Hoặc dán link')}
              onSubmitEditing={() => accept(text)}
            />
            <Button label={t('Kết nối')} onPress={() => accept(text)} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.hint}>{t('Khi đang hiện game: giữ ngón tay ở góc trên bên trái (hoặc nút Back trên Android) để mở menu.')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 16, gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  card: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  text: { color: colors.text, fontSize: 15 },
  step: { color: '#c9d1de', fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#2a3241', backgroundColor: '#0c1017', color: colors.text, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  scanner: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: 24 },
  scanText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', backgroundColor: 'rgba(0,0,0,.55)', padding: 10, borderRadius: 10 }
});
