import { StyleSheet } from 'react-native';

export const colors = {
  background: '#0b0d12',
  card: '#11151d',
  border: '#222936',
  text: '#f4f7fb',
  muted: '#9aa6b8',
  ink: '#120c2e',
  gold: '#ffd23f',
  error: '#fb7185'
};

export const ui = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, borderWidth: 2, borderColor: '#2a3241', backgroundColor: '#1a2030', alignItems: 'center' },
  buttonText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  primary: { borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.gold },
  primaryText: { color: colors.ink, fontSize: 19 },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.9 }
});
