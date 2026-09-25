import { t } from '../../shared/i18n';
import { CATEGORY_BANK } from '../content/english';
import type { PointAward } from '../engine';
import { aliases, isEnglishAttempt, matchesAlias, normalizeEnglish } from '../english';
import { checkBankLines } from '../bankFile';
import { chatTest, commandArgument, pickUnasked, view, type GameDefinition } from '../types';

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
  accent: '#0ea5e9',
  howTo: 'Màn hình hiện chủ đề và các ô đáp án ẩn. Viewer comment từ tiếng Anh thuộc chủ đề để lật ô (số nhiều cũng được). Mỗi ô lật được +1.',
  commands: [
    { usage: 'apple', description: 'Gõ một từ thuộc chủ đề' },
    { usage: '!ans apple', description: 'Cách viết khác' }
  ],
  aliases: ['nameit'],
  defaultConfig: { seconds: 120, bank: CATEGORY_BANK },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 20, max: 600 },
    {
      key: 'bank',
      label: 'Chủ đề',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Mỗi dòng: Chủ đề | đáp án[/từ khác] | … (2–12 đáp án). Nhập được file .txt / .csv (Excel, Google Sheets).',
      sample: [
        '# Mẫu Name It — mỗi dòng 1 chủ đề với 2–12 đáp án tiếng Anh:',
        '# Chủ đề | đáp án 1 | đáp án 2[/cách viết khác] | …',
        '# - Excel / Google Sheets: cột A = chủ đề, các cột sau = đáp án, tải xuống .csv rồi nhập.',
        '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
        'Fruits 🍎 | apple | banana | orange | mango | grape',
        'Pets 🐶 | dog | cat | rabbit | hamster | fish | parrot'
      ].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkBankLines(text, (line) => parseCategories(line).length === 1) : null;
  },

  start(config, ctx) {
    const categories = parseCategories(config.bank);
    if (!categories.length) return { error: t('Không có chủ đề hợp lệ.') };
    const { index, asked } = pickUnasked(categories.length, ctx.previous?.asked ?? [], ctx.random);
    return {
      state: { category: categories[index] as NameItCategory, found: {}, revealed: false, asked },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input) {
    if (input.kind !== 'chat' || state.revealed) return null;
    const raw = commandArgument(input.text, ['ans', 'answer']);
    if (raw === null || !isEnglishAttempt(raw)) return null;
    const text = normalizeEnglish(raw);
    const slot = state.category.slots.findIndex((candidate) => matchesAlias(text, candidate.aliases, true));
    // Misses and already-found answers are ignored without using up the cooldown.
    if (slot < 0 || state.found[slot]) return null;

    const found = { ...state.found, [slot]: { user: input.user, nickname: input.nickname } };
    return {
      consumed: true,
      finish: Object.keys(found).length === state.category.slots.length,
      message: t('{name} tìm ra “{answer}”', { name: input.nickname, answer: state.category.slots[slot]?.label ?? '' }),
      effects: [{ kind: 'correct', text: state.category.slots[slot]?.label, user: input.nickname }],
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
      message: t('Tìm được {count}/{total} đáp án{party}.', { count, total: state.category.slots.length, party: count === state.category.slots.length ? ' 🎉' : '' })
    };
  },

  testActions(state) {
    const missing = state.category.slots.find((_, index) => !state.found[index]);
    return [
      ...(missing ? [chatTest(t('Đáp án: {answer}', { answer: missing.label }), missing.label, 2)] : []),
      chatTest(t('Trả lời sai'), 'spaceship', 2)
    ];
  },

  view(state) {
    const total = state.category.slots.length;
    const count = Object.keys(state.found).length;
    return view({
      headline: state.category.name,
      hint: state.revealed ? null : t('Comment từ tiếng Anh • Đã tìm {count}/{total}', { count, total }),
      rows: state.category.slots.map((slot, index) => {
        const finder = state.found[index];
        return {
          badge: String(index + 1),
          label: finder || state.revealed ? slot.label : mask(slot.label),
          value: finder?.nickname,
          avatar: finder?.nickname,
          highlight: Boolean(finder)
        };
      })
    });
  }
};
