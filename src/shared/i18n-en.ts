import { EN_APP } from './en/app';
import { EN_CORE } from './en/core';
import { EN_GAMES1 } from './en/games1';
import { EN_GAMES2 } from './en/games2';
import { EN_GAMES3 } from './en/games3';
import { EN_UI } from './en/ui';

/**
 * English dictionary: Vietnamese source text → English. Split by area so the
 * files stay readable; `{name}` and numeric `{0}` placeholders are explained
 * in i18n.ts.
 */
export const EN: Record<string, string> = { ...EN_CORE, ...EN_GAMES1, ...EN_GAMES2, ...EN_GAMES3, ...EN_UI, ...EN_APP };
