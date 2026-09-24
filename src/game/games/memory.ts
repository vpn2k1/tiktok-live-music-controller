import { checkBankLines } from '../bankFile';
import { chatTest, commandArgument, ranked, shuffle, view, type GameCategory, type GameDefinition } from '../types';
import { t } from '../../shared/i18n';

/**
 * "Lật hình ghép cặp": face-down cards hide pairs. A viewer comments two
 * numbers to flip them; a pair stays open and scores, otherwise both flip back
 * after a moment. The round ends when every pair is found (or time runs out).
 * The two faces of a pair may differ (あ ↔ a, 猫 ↔ mèo) for language practice.
 */
const FACES = ['🍎', '🍌', '🍇', '🍓', '🍉', '🍒', '🐶', '🐱', '🐼', '🦊', '🐸', '🐧', '⚽', '🎸', '🚀', '🌈', '🍦', '🎁'];
export const EMOJI_PAIRS = FACES.map((face) => `${face} | ${face}`).join('\n');
/** How long a wrong pair stays face up. */
export const PEEK_MS = 1800;

export interface MemoryRound {
  faces: string[];
  /** Cards with the same id belong together. */
  pairIds: number[];
  matched: boolean[];
  /** Two cards shown face up after a miss, until `until`. */
  peek: { a: number; b: number; until: number } | null;
  finders: Record<string, { nickname: string; pairs: number }>;
}

type MemoryConfig = { pairs: number; seconds: number; points: number; bank: string };

/** "face A | face B" lines (same face twice for picture pairs). */
export function parsePairs(text: string): [string, string][] {
  return text.split(/\r?\n/).flatMap((line) => {
    const [a = '', b = ''] = line.split('|').map((part) => part.trim().slice(0, 16));
    return a && b ? [[a, b] as [string, string]] : [];
  });
}

/** "3 8", "3-8", "3,8", "!lat 3 8" → [2, 7]; null when it isn't two card numbers. */
export function parsePair(text: string, count: number): [number, number] | null {
  const arg = commandArgument(text, ['lat', 'flip', 'mo']);
  const match = arg == null ? null : /^(\d{1,2})\s*[\s,.\-–]\s*(\d{1,2})$/.exec(arg.trim());
  if (!match) return null;
  const a = Number(match[1]) - 1;
  const b = Number(match[2]) - 1;
  return a !== b && a >= 0 && b >= 0 && a < count && b < count ? [a, b] : null;
}

function allFound(state: MemoryRound): boolean {
  return state.matched.every(Boolean);
}

interface MemoryOptions {
  id: string;
  title: string;
  category: GameCategory;
  accent: string;
  aliases: string[];
  howTo: string;
  /** Built-in pairs ("face A | face B" lines). */
  defaultPairs: string;
  sample: string;
}

export function createMemoryGame(options: MemoryOptions): GameDefinition<MemoryRound, MemoryConfig> {
  return {
    id: options.id,
    title: options.title,
    category: options.category,
    accent: options.accent,
    aliases: options.aliases,
    howTo: options.howTo,
    commands: [{ usage: '3 8', description: 'Lật thẻ số 3 và số 8 (hoặc 3-8, !lat 3 8)' }],
    defaultConfig: { pairs: 6, seconds: 120, points: 100, bank: '' },
    settings: [
      { key: 'pairs', label: 'Số cặp thẻ', type: 'number', min: 3, max: 12 },
      { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 20, max: 900 },
      { key: 'points', label: 'Điểm mỗi cặp', type: 'number', min: 1, max: 10_000 },
      {
        key: 'bank',
        label: 'Cặp thẻ riêng (tuỳ chọn)',
        type: 'textarea',
        maxLength: 50_000,
        hint: 'Để trống = dùng bộ có sẵn. Mỗi dòng: mặt A | mặt B (hai mặt của một cặp). Nhập được file .txt / .csv.',
        sample: options.sample
      }
    ],

    checkBank(key, text) {
      return key === 'bank' ? checkBankLines(text, (line) => parsePairs(line).length === 1) : null;
    },

    start(config, ctx) {
      const own = parsePairs(config.bank);
      const pool = own.length >= 2 ? own : parsePairs(options.defaultPairs);
      const picked = shuffle(pool, ctx.random).slice(0, config.pairs);
      const cards = shuffle(picked.flatMap(([a, b], id) => [{ face: a, id }, { face: b, id }]), ctx.random);
      return {
        state: { faces: cards.map((card) => card.face), pairIds: cards.map((card) => card.id), matched: cards.map(() => false), peek: null, finders: {} },
        durationMs: config.seconds * 1000
      };
    },

    handle(state, input, config, ctx) {
      if (input.kind !== 'chat' || allFound(state)) return null;
      const pair = parsePair(input.text, state.faces.length);
      if (!pair) return null;
      // While a miss is still showing, wait for it to flip back.
      if (state.peek && ctx.now < state.peek.until) return { state, consumed: true };
      const [a, b] = pair;
      if (state.matched[a] || state.matched[b]) return { state, consumed: true };
      if (state.pairIds[a] !== state.pairIds[b]) {
        return {
          consumed: true,
          effects: [{ kind: 'wrong', text: `${state.faces[a]} ≠ ${state.faces[b]}`, user: input.nickname }],
          state: { ...state, peek: { a, b, until: ctx.now + PEEK_MS } }
        };
      }
      const old = state.finders[input.user];
      const next: MemoryRound = {
        ...state,
        peek: null,
        matched: state.matched.map((done, index) => done || index === a || index === b),
        finders: { ...state.finders, [input.user]: { nickname: input.nickname, pairs: (old?.pairs ?? 0) + 1 } }
      };
      return {
        consumed: true,
        finish: allFound(next),
        awards: [{ user: input.user, nickname: input.nickname, points: config.points }],
        message: t('{name} tìm được cặp {a} – {b}!', { name: input.nickname, a: state.faces[a] ?? '', b: state.faces[b] ?? '' }),
        effects: [{ kind: 'correct', text: `${state.faces[a]} = ${state.faces[b]} +${config.points}`, user: input.nickname }],
        state: next
      };
    },

    tick(state, _config, ctx) {
      return state.peek && ctx.now >= state.peek.until ? { consumed: false, state: { ...state, peek: null } } : null;
    },

    finish(state) {
      const best = ranked(Object.entries(state.finders).map(([user, entry]) => ({ user, ...entry })), (entry) => entry.pairs)[0];
      const found = state.matched.filter(Boolean).length / 2;
      return {
        state: { ...state, peek: null, matched: state.faces.map(() => true) },
        awards: [],
        message: allFound(state)
          ? `${t('🎉 Tìm đủ {found} cặp!', { found })}${best ? ` ${t('Giỏi nhất: {name} ({pairs} cặp)', { name: best.nickname, pairs: best.pairs })}` : ''}`
          : t('⏰ Hết giờ! Tìm được {found}/{total} cặp.', { found, total: state.faces.length / 2 }),
        effects: [best ? { kind: 'win', text: t('🃏 {pairs} cặp', { pairs: best.pairs }), user: best.nickname } : { kind: 'lose', text: t('Hết giờ') }]
      };
    },

    testActions(state) {
      if (allFound(state)) return [];
      const open = state.faces.map((_, index) => index).filter((index) => !state.matched[index]);
      const first = open[0] ?? 0;
      const twin = open.find((index) => index !== first && state.pairIds[index] === state.pairIds[first]) ?? first;
      const other = open.find((index) => state.pairIds[index] !== state.pairIds[first]);
      return [
        chatTest(t('Lật đúng cặp'), `${first + 1} ${twin + 1}`, 1),
        ...(other != null ? [chatTest(t('Lật sai cặp'), `${first + 1} ${other + 1}`, 2)] : [])
      ];
    },

    view(state) {
      const finders = ranked(Object.entries(state.finders).map(([user, entry]) => ({ user, ...entry })), (entry) => entry.pairs).slice(0, 3);
      const left = state.matched.filter((done) => !done).length / 2;
      return view({
        headline: allFound(state) ? t('🎉 Tìm đủ các cặp!') : t('🃏 Còn {left} cặp', { left }),
        hint: t('Comment 2 số để lật (vd 3 8) • trùng hình được điểm'),
        cards: {
          columns: state.faces.length <= 12 ? 4 : 6,
          cards: state.faces.map((face, index) => ({
            face,
            label: String(index + 1),
            state: state.matched[index] ? 'good' as const : state.peek && (state.peek.a === index || state.peek.b === index) ? 'peek' as const : 'closed' as const
          }))
        },
        rows: finders.map((entry) => ({ label: entry.nickname, avatar: entry.nickname, value: t('{pairs} cặp', { pairs: entry.pairs }) }))
      });
    }
  };
}

export const memoryGame = createMemoryGame({
  id: 'latHinh',
  title: 'Lật hình ghép cặp 🃏',
  category: 'fun',
  accent: '#8b5cf6',
  aliases: ['lathinh', 'memory'],
  howTo: 'Các thẻ úp giấu từng cặp hình giống nhau. Comment 2 số (vd "3 8") để lật: trùng cặp thì giữ nguyên và được điểm, khác thì úp lại. Tìm hết các cặp để kết thúc!',
  defaultPairs: EMOJI_PAIRS,
  sample: ['# Mẫu cặp thẻ — mỗi dòng 1 cặp:', '# mặt A | mặt B (giống nhau cho cặp hình, khác nhau cho cặp chữ – nghĩa)', '🍎 | 🍎', 'cat | con mèo'].join('\n')
});
