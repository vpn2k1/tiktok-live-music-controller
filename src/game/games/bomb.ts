import type { PointAward } from '../engine';
import { chatTest, commandArgument, ranked, view, type GameDefinition } from '../types';
import { t } from '../../shared/i18n';

/**
 * "Gỡ bom": N numbered wires, one of them sets the bomb off. Viewers cut one
 * wire each by commenting its number; every safe cut scores more as the risk
 * grows. Cut every safe wire to defuse the bomb — cut the wrong one and BOOM.
 */
const COLORS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪', '🩷', '🩵', '💚'];

export interface BombRound {
  wires: number;
  bomb: number;
  /** Who cut each wire (null = still connected). */
  cuts: ({ user: string; nickname: string; points: number } | null)[];
  exploded: { user: string; nickname: string } | null;
}

type BombConfig = { wires: number; seconds: number; maxPoints: number; defusePoints: number };

function safeCuts(state: BombRound): number {
  return state.cuts.filter((cut, index) => cut && index !== state.bomb).length;
}

function defused(state: BombRound): boolean {
  return !state.exploded && safeCuts(state) === state.wires - 1;
}

export const bombGame: GameDefinition<BombRound, BombConfig> = {
  id: 'goBom',
  title: 'Gỡ bom 💣',
  category: 'fun',
  accent: '#dc2626',
  aliases: ['gobom', 'bomb'],
  howTo: 'Có nhiều dây, một dây là bom! Mỗi người được cắt 1 dây: comment số dây. Dây an toàn được điểm, càng về sau càng nhiều. Cắt hết dây an toàn là gỡ bom thành công — cắt trúng bom là BÙM!',
  commands: [{ usage: '3', description: 'Cắt dây số 3 (hoặc !cut 3), mỗi người 1 lần' }],
  defaultConfig: { wires: 8, seconds: 90, maxPoints: 50, defusePoints: 200 },
  settings: [
    { key: 'wires', label: 'Số dây', type: 'number', min: 3, max: 12 },
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 15, max: 600 },
    { key: 'maxPoints', label: 'Điểm dây đầu tiên', type: 'number', min: 1, max: 10_000, hint: 'Mỗi dây an toàn sau đó được thêm 50%.' },
    { key: 'defusePoints', label: 'Thưởng gỡ bom thành công', type: 'number', min: 0, max: 100_000, hint: 'Chia cho mọi người đã cắt dây an toàn.' }
  ],

  start(config, ctx) {
    const wires = config.wires;
    return {
      state: { wires, bomb: Math.min(wires - 1, Math.floor(ctx.random() * wires)), cuts: Array.from({ length: wires }, () => null), exploded: null },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config) {
    if (input.kind !== 'chat' || state.exploded || defused(state)) return null;
    const text = commandArgument(input.text, ['cut', 'cat']);
    if (text === null || !/^\d{1,2}$/.test(text.trim())) return null;
    const wire = Number(text) - 1;
    if (wire < 0 || wire >= state.wires) return null;
    // One cut per viewer per round, and a cut wire stays cut.
    if (state.cuts[wire] || state.cuts.some((cut) => cut?.user === input.user)) return { state, consumed: true };
    if (wire === state.bomb) {
      return {
        consumed: true,
        finish: true,
        message: t('💥 BÙM! {name} cắt trúng dây bom số {wire}!', { name: input.nickname, wire: wire + 1 }),
        effects: [{ kind: 'lose', text: t('💥 {name} cắt trúng bom!', { name: input.nickname }), user: input.nickname }],
        state: { ...state, cuts: state.cuts.map((cut, index) => (index === wire ? { user: input.user, nickname: input.nickname, points: 0 } : cut)), exploded: { user: input.user, nickname: input.nickname } }
      };
    }
    const points = Math.round(config.maxPoints * (1 + safeCuts(state) * 0.5));
    const next: BombRound = { ...state, cuts: state.cuts.map((cut, index) => (index === wire ? { user: input.user, nickname: input.nickname, points } : cut)) };
    const done = defused(next);
    return {
      consumed: true,
      finish: done,
      awards: [{ user: input.user, nickname: input.nickname, points }],
      message: done ? t('✅ Gỡ bom thành công!') : t('✂️ {name} cắt dây {wire}: an toàn! (+{points})', { name: input.nickname, wire: wire + 1, points }),
      effects: [{ kind: 'correct', text: `✂️ +${points}`, user: input.nickname }],
      state: next
    };
  },

  finish(state, config) {
    const cutters = state.cuts.filter((cut, index): cut is NonNullable<typeof cut> => cut != null && index !== state.bomb);
    const win = defused(state);
    const bonus = win && cutters.length ? Math.round(config.defusePoints / cutters.length) : 0;
    const awards: PointAward[] = bonus ? cutters.map((cut) => ({ user: cut.user, nickname: cut.nickname, points: bonus })) : [];
    const message = state.exploded
      ? t('💥 BÙM! {name} cắt trúng bom (dây {wire}).', { name: state.exploded.nickname, wire: state.bomb + 1 })
      : win
        ? t('✅ Gỡ bom thành công! {count} người chia {points} điểm thưởng.', { count: cutters.length, points: config.defusePoints })
        : t('⏰ Hết giờ! Bom ở dây {wire}, may mà chưa nổ.', { wire: state.bomb + 1 });
    return {
      state: { ...state, cuts: [...state.cuts] },
      awards,
      message,
      effects: [win ? { kind: 'win', text: t('✅ Gỡ bom thành công!') } : { kind: 'lose', text: state.exploded ? t('💥 BÙM!') : t('Hết giờ') }]
    };
  },

  testActions(state) {
    if (state.exploded || defused(state)) return [];
    const safe = state.cuts.findIndex((cut, index) => !cut && index !== state.bomb);
    return [
      ...(safe >= 0 ? [chatTest(t('Cắt dây an toàn {wire}', { wire: safe + 1 }), String(safe + 1), 4)] : []),
      chatTest(t('Cắt dây bom {wire}', { wire: state.bomb + 1 }), String(state.bomb + 1), 0.3)
    ];
  },

  view(state) {
    const over = Boolean(state.exploded) || defused(state);
    const cutters = ranked(state.cuts.flatMap((cut, index) => (cut && index !== state.bomb ? [cut] : [])), (cut) => cut.points).slice(0, 2);
    return view({
      headline: state.exploded ? t('💥 BÙM!') : defused(state) ? t('✅ Đã gỡ bom!') : t('💣 Còn {count} dây', { count: state.cuts.filter((cut) => !cut).length }),
      hint: over ? t('Bom ở dây số {wire}', { wire: state.bomb + 1 }) : t('1 dây là bom! Gõ số dây để cắt (1–{wires}) • mỗi người 1 lần', { wires: state.wires }),
      cards: {
        columns: state.wires <= 8 ? 4 : 6,
        cards: state.cuts.map((cut, index) => {
          const isBomb = index === state.bomb;
          const revealBomb = over && isBomb;
          return {
            label: `${COLORS[index % COLORS.length]} ${index + 1}`,
            face: isBomb ? '💥' : '✂️',
            state: cut ? (isBomb ? 'bad' as const : 'good' as const) : revealBomb ? 'bad' as const : 'closed' as const
          };
        })
      },
      rows: cutters.map((cut) => ({ label: cut.nickname, avatar: cut.nickname, value: `+${cut.points}` }))
    });
  }
};
