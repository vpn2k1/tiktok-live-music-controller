import { Pressable, Text } from 'react-native';
import { ui } from './theme';

export default function Button({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [ui.button, primary && ui.primary, pressed && ui.pressed]}
    >
      <Text style={[ui.buttonText, primary && ui.primaryText]}>{label}</Text>
    </Pressable>
  );
}
