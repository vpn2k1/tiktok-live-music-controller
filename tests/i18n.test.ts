// App language (Vietnamese source text → English dictionary). Run with `npm test`.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { GAME_CATEGORY_LABELS } from '../src/game/types';
import { GAMES } from '../src/game/registry';
import { EN } from '../src/shared/i18n-en';
import { getLanguage, lookup, setLanguage, t } from '../src/shared/i18n';

/** Vietnamese letters with diacritics (plain ASCII words like "game" are fine in English). */
const VIETNAMESE = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;

/** Metadata that is itself a Vietnamese answer example (Vietnamese word chain). */
const DATA = new Set(['nhạc sĩ']);

afterEach(() => setLanguage('vi'));

test('t(): Vietnamese by default, English from the dictionary', () => {
  assert.equal(getLanguage(), 'vi');
  assert.equal(t('Còn {n} giây', { n: 5 }), 'Còn 5 giây');
  setLanguage('en');
  const [key, english] = Object.entries(EN).find(([k]) => !/\{/.test(k)) ?? ['', ''];
  assert.equal(t(key), english);
  // Unknown text falls back to itself; placeholders are still filled.
  assert.equal(t('Chưa có bản dịch {x}', { x: 1 }), 'Chưa có bản dịch 1');
  setLanguage('xx');
  assert.equal(getLanguage(), 'vi');
});

test('lookup(): numbers in a text match a {0} entry', () => {
  const entry = Object.entries(EN).find(([k]) => /^[^{}]*\{0\}[^{}]*$/.test(k));
  assert.ok(entry, 'the dictionary has at least one numeric entry');
  const [key, english] = entry;
  assert.equal(lookup(key.replace('{0}', '1.440')), english.replace('{0}', '1.440'));
});

test('dictionary: placeholders match their Vietnamese keys', () => {
  const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const wrong = Object.entries(EN).filter(([vi, en]) => names(vi) !== names(en));
  assert.deepEqual(wrong, []);
});

test('every game has English metadata', () => {
  setLanguage('en');
  const untranslated: string[] = [];
  // English may still quote Vietnamese answer words (đúng / sai…), so check that an entry exists.
  const check = (text: string | undefined) => {
    if (text && VIETNAMESE.test(text) && !DATA.has(text) && t(text) === text) untranslated.push(text);
  };
  for (const label of Object.values(GAME_CATEGORY_LABELS)) check(label);
  for (const game of GAMES) {
    check(game.title);
    check(game.howTo);
    for (const command of game.commands) {
      check(command.usage);
      check(command.description);
    }
    for (const field of game.settings) {
      check(field.label);
      check(field.hint);
      for (const option of field.options ?? []) check(option.label);
    }
  }
  assert.deepEqual(untranslated, []);
});
