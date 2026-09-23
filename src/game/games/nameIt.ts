import { CATEGORY_BANK } from '../content/english';
import type { PointAward } from '../engine';
import { aliases, isEnglishAttempt, matchesAlias, normalizeEnglish } from '../english';
import { chatTest, pickUnasked, view, type GameDefinition } from '../types';

export interface NameItCategory {
  name: string;
  slots: { label: string; aliases: string[] }[];
}

export interface NameItRound {
  category: NameItCategory;
  found: Record<number, { user: string; nickname: string }>;
  revealed: boolean;
  asked: number[];
}

type NameItConfig = { seconds: number; bank: string };

export function parseCategories(text: string): NameItCategory[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const [name = '', ...answers] = line.split('|').map((part) => part.trim());
    const slots = answers
      .map((answer) => ({ label: answer.split('/')[0]?.trim() ?? '', aliases: aliases(answer) }))
      .filter((slot) => slot.label && slot.aliases.length);
    return name && slots.length >= 2 && slots.length <= 12 ? [{ name, slots }] : [];
  });
}

function mask(label: string): string {
  return label.split(' ').map((word) => '_'.repeat(word.length).split('').join(' ')).join('   ');
}

export const nameItGame: GameDefinition<NameItRound, NameItConfig> = {
  id: 'nameIt',
  title: 'Name It! 📋',
  category: 'english',
  howTo: 'Màn hình hiện chủ đề và các ô đáp án ẩn. Viewer comment từ tiếng Anh thuộc chủ đề để lật ô (số nhiều cũng được). Mỗi ô lật được +1.',
  defaultConfig: { seconds: 120, bank: CATEGORY_BANK },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 20, max: 600 },
    { key: 'bank', label: 'Chủ đề', type: 'textarea', maxLength: 20_000, hint: 'Mỗi dòng: Chủ đề | đáp án[/từ khác] | … (2–12 đáp án).' }
  ],

  start(config, ctx) {
    const categories = parseCategories(config.bank);
    if (!categories.length) return { error: 'Không có chủ đề hợp lệ.' };
    const { index, asked } = pickUnasked(categories.length, ctx.previous?.asked ?? [], ctx.random);
    return {
      state: { category: categories[index] as NameItCategory, found: {}, revealed: false, asked },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input) {
    if (input.kind !== 'chat' || state.revealed || !isEnglishAttempt(input.text)) return null;
    const text = normalizeEnglish(input.text);
    const slot = state.category.slots.findIndex((candidate) => matchesAlias(text, candidate.aliases, true));
    if (slot < 0 || state.found[slot]) return { state, consumed: true };

    const found = { ...state.found, [slot]: { user: input.user, nickname: input.nickname } };
    return {
      consumed: true,
      finish: Object.keys(found).length === state.category.slots.length,
      message: `${input.nickname} tìm ra “${state.category.slots[slot]?.label}”`,
      state: { ...state, found }
    };
  },

  finish(state) {
    const totals = new Map<string, PointAward>();
    for (const entry of Object.values(state.found)) {
      const old = totals.get(entry.user);
      totals.set(entry.user, { user: entry.user, nickname: entry.nickname, points: (old?.points ?? 0) + 1 });
    }
    const count = Object.keys(state.found).length;
    return {
      state: { ...state, revealed: true },
      awards: [...totals.values()],
      message: `Tìm được ${count}/${state.category.slots.length} đáp án${count === state.category.slots.length ? ' 🎉' : ''}.`
    };
  },

  testActions(state) {
    const missing = state.category.slots.find((_, index) => !state.found[index]);
    return [
      ...(missing ? [chatTest(`Đáp án: ${missing.label}`, missing.label, 2)] : []),
      chatTest('Trả lời sai', 'spaceship', 2)
    ];
  },

  view(state) {
    const total = state.category.slots.length;
    const count = Object.keys(state.found).length;
    return view({
      headline: state.category.name,
      hint: state.revealed ? null : `Comment từ tiếng Anh • Đã tìm ${count}/${total}`,
      rows: state.category.slots.map((slot, index) => {
        const finder = state.found[index];
        return {
          badge: String(index + 1),
          label: finder || state.revealed ? slot.label : mask(slot.label),
          value: finder?.nickname,
          highlight: Boolean(finder)
        };
      })
    });
  }
};
