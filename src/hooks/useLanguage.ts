import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage, type Language } from '../shared/i18n';

/** Current app language; the component re-renders (and memos keyed on it recompute) when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
