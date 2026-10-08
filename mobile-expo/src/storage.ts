import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePhoneLink, type PhoneLink } from './shared';

const KEY = 'phone-link';

/** The paired computer, re-checked on load (stored text is never trusted as a URL). */
export async function loadLink(): Promise<PhoneLink | null> {
  try {
    return parsePhoneLink(await AsyncStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function saveLink(link: PhoneLink): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, link.url);
  } catch {
    // Storage unavailable: pair again next time.
  }
}
