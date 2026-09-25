import { t } from '../../shared/i18n';
import { podiumOf } from '../series';
import type { PointAward } from '../engine';
import { isBangCommand } from '../teamRoster';
import { chatTest, giftTest, view, type GameDefinition } from '../types';

/**
 * Vua của đồi: everyone fights over one crown. `!cuop` takes it (unless the king
 * is shielded); the longer you hold it, the more points. Gifts shield the king,
 * or let a challenger take the crown through the shield.
 */
interface Holder {
  user: string;
  nickname: string;
}

export interface HillRound {
  king: Holder | null;
  /** When the current king took the crown. */
  since: number;
  shieldUntil: number;
  /** Last clock reading (the view has no clock; tick keeps this fresh). */
  clock: number;
  /** Time each viewer held the crown before (current reign not included). Mutable, written in `commit`. */
  held: Map<string, { nickname: string; ms: number }>;
  steals: number;
}

type HillConfig = { seconds: number; grace: number; giftShield: number; pointsPerSecond: number };

const STEAL_NAMES = ['cuop', 'steal'];
const TOP_ROWS = 5;
const LONGEST_BONUS = 20;

/** Crown time per viewer, the current reign included (up to `now`). */
export function reignTimes(state: HillRound, now: number): { user: string; nickname: string; ms: number }[] {
  const times = new Map([...state.held].map(([user, entry]) => [user, { user, ...entry }]));
  if (state.king) {
    const entry = times.get(state.king.user) ?? { user: state.king.user, nickname: state.king.nickname, ms: 0 };
    times.set(state.king.user, { ...entry, ms: entry.ms + Math.max(0, now - state.since) });
  }
  return [...times.values()].sort((a, b) => b.ms - a.ms || a.user.localeCompare(b.user));
}

/** Takes the crown: the old king's reign is added to their time in `commit`. */
function crown(state: HillRound, holder: Holder, now: number, shieldMs: number): { state: HillRound; commit: () => void } {
  const old = state.king;
  const reign = Math.max(0, now - state.since);
  const held = state.held;
  return {
    state: { ...state, king: holder, since: now, shieldUntil: now + shieldMs, clock: now, steals: state.steals + (old ? 1 : 0) },
    commit: () => {
      if (!old) return;
      const entry = held.get(old.user);
      held.set(old.user, { nickname: old.nickname, ms: (entry?.ms ?? 0) + reign });
    }
  };
}

function secondsText(ms: number): string {
  return String(Math.floor(ms / 1000));
}

export const kingOfHillGame: GameDefinition<HillRound, HillConfig> = {
  id: 'vuaDoi',
  title: 'Vua của đồi 👑',
  category: 'versus',
  accent: '#eab308',
  aliases: ['vuadoi', 'king', 'koth'],
  howTo: 'Cả phòng tranh một vương miện: gõ !cuop để cướp ngai. Vừa lên ngai được vài giây khiên, không ai cướp được. Giữ ngai càng lâu càng nhiều điểm. Vua tặng quà để thêm khiên; người khác tặng quà thì cướp được ngai xuyên khiên.',
  commands: [
    { usage: '!cuop', description: 'Cướp vương miện (khi vua hết khiên)' },
    { usage: 'Tặng quà', description: 'Vua: thêm khiên • Người khác: cướp xuyên khiên' }
  ],
  defaultConfig: { seconds: 120, grace: 3, giftShield: 10, pointsPerSecond: 2 },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 30, max: 1800 },
    { key: 'grace', label: 'Giây khiên sau khi lên ngai', type: 'number', min: 0, max: 60, hint: 'Phòng đông nên để 3–5 giây để vương miện không đổi chủ liên tục.' },
    { key: 'giftShield', label: 'Giây khiên mỗi quà', type: 'number', min: 0, max: 600 },
    { key: 'pointsPerSecond', label: 'Điểm mỗi giây giữ ngai', type: 'number', min: 1, max: 100 }
  ],

  start(config, ctx) {
    return {
      state: { king: null, since: ctx.now, shieldUntil: 0, clock: ctx.now, held: new Map(), steals: 0 },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    const now = ctx.now;
    const me: Holder = { user: input.user, nickname: input.nickname };

    if (input.kind === 'chat') {
      if (!isBangCommand(input.text, STEAL_NAMES)) return null;
      if (state.king?.user === input.user) return { state, consumed: true };
      if (state.king && now < state.shieldUntil) {
        return { state, consumed: true, message: t('🛡 {name} đang có khiên {s} giây', { name: state.king.nickname, s: Math.ceil((state.shieldUntil - now) / 1000) }) };
      }
      const taken = crown(state, me, now, config.grace * 1000);
      return {
        consumed: true,
        state: taken.state,
        commit: taken.commit,
        message: state.king ? t('👑 {name} cướp ngai của {old}!', { name: input.nickname, old: state.king.nickname }) : t('👑 {name} lên ngai!', { name: input.nickname }),
        effects: [{ kind: 'score', text: '👑', user: input.nickname }]
      };
    }

    if (input.kind !== 'gift' || config.giftShield <= 0) return null;
    const shieldMs = config.giftShield * 1000 * Math.max(1, input.count);
    if (state.king?.user === input.user) {
      return {
        consumed: false,
        state: { ...state, shieldUntil: Math.max(state.shieldUntil, now) + shieldMs, clock: now },
        effects: [{ kind: 'score', text: `🛡 +${Math.round(shieldMs / 1000)}s`, user: input.nickname }]
      };
    }
    // A challenger's gift breaks through the shield and gives them one.
    const taken = crown(state, me, now, shieldMs);
    return {
      consumed: false,
      state: taken.state,
      commit: taken.commit,
      message: t('🎁👑 {name} tặng quà cướp ngai!', { name: input.nickname }),
      effects: [{ kind: 'hit', text: '👑', user: input.nickname }]
    };
  },

  tick(state, _config, ctx) {
    // Refresh the reign / shield seconds shown on the overlay, once a second.
    if (Math.floor(ctx.now / 1000) === Math.floor(state.clock / 1000)) return null;
    return { consumed: false, state: { ...state, clock: ctx.now } };
  },

  finish(state, config, ctx) {
    const times = reignTimes(state, ctx.now);
    const awards: PointAward[] = times
      .filter((entry) => entry.ms >= 1000)
      .map((entry, index) => ({
        user: entry.user,
        nickname: entry.nickname,
        points: Math.round((entry.ms / 1000) * config.pointsPerSecond) + (index === 0 ? LONGEST_BONUS : 0)
      }));
    const best = times[0];
    return {
      state: { ...state, clock: ctx.now },
      awards,
      message: best
        ? t('👑 {name} giữ ngai lâu nhất: {s} giây ({n} lần đổi chủ)', { name: best.nickname, s: secondsText(best.ms), n: state.steals })
        : t('Chưa ai lên ngai.'),
      effects: [best
        ? podiumOf(times.slice(0, 3).map((entry) => ({ nickname: entry.nickname, value: t('{s} giây', { s: secondsText(entry.ms) }) })), t('👑 Giữ ngai lâu nhất'))
        : { kind: 'lose', text: t('Chưa ai lên ngai.') }]
    };
  },

  testActions() {
    return [chatTest('!cuop', '!cuop', 3), giftTest('Rose', 1, 0.5)];
  },

  view(state) {
    const now = state.clock;
    const king = state.king;
    const shield = king ? Math.max(0, state.shieldUntil - now) : 0;
    return view({
      headline: king ? `👑 ${king.nickname}` : t('👑 Ngai đang trống!'),
      hint: !king
        ? t('Gõ !cuop để lên ngai!')
        : shield > 0
          ? t('🛡 Khiên {s} giây • Giữ ngai {h} giây', { s: Math.ceil(shield / 1000), h: secondsText(now - state.since) })
          : t('Giữ ngai {h} giây • Gõ !cuop để cướp!', { h: secondsText(now - state.since) }),
      rows: reignTimes(state, now).slice(0, TOP_ROWS).map((entry, index) => ({
        badge: String(index + 1),
        avatar: entry.nickname,
        label: entry.nickname,
        value: t('{s} giây', { s: secondsText(entry.ms) }),
        highlight: entry.user === king?.user
      }))
    });
  }
};
