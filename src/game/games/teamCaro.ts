import type { OverlayGrid } from '../../shared/types';
import type { EffectInput, PointAward } from '../engine';
import { podiumOf } from '../series';
import { teamChoice, TeamRoster, type Team } from '../teamRoster';
import { chatTest, commandArgument, pickUnasked, view, type GameDefinition } from '../types';
import { checkVocabBank, foldFor, vocabBank, vocabSettings, type VocabLang, type VocabWord } from '../vocab';
import { t } from '../../shared/i18n';

/**
 * Cờ caro Đỏ – Xanh: a board of Vietnamese meanings. Viewers join Red or Blue
 * and claim a square for their team by commenting its English / Japanese /
 * Chinese word. Three claimed squares in a row win the board; the first team
 * to win the set number of boards wins the match.
 */
export interface CaroCell {
  word: VocabWord;
  owner: Team | null;
  claimer: { user: string; nickname: string } | null;
}

export interface CaroRound {
  lang: VocabLang;
  size: number;
  cells: CaroCell[];
  board: number;
  wins: [number, number];
  stage: 'play' | 'show' | 'done';
  /** Winning line of the board just played (cell indices). */
  line: number[] | null;
  boardWinner: Team | null;
  roster: TeamRoster;
  asked: number[];
}

type CaroConfig = { preset: string; bank: string; size: number; target: number; boardSeconds: number; showSeconds: number; points: number; winPoints: number };

const IN_A_ROW = 3;
const MAX_BOARDS = 7;
const TEAM_NAMES: [string, string] = ['Phe Đỏ', 'Phe Xanh'];
const LANG_NAMES: Record<VocabLang, string> = { en: 'tiếng Anh', ja: 'tiếng Nhật', zh: 'tiếng Trung' };

function teamName(team: Team): string {
  return t(TEAM_NAMES[team]);
}

/** Three in a row through `cell` owned by `team`, or null. */
export function lineThrough(owners: (Team | null)[], size: number, cell: number, team: Team): number[] | null {
  const row = Math.floor(cell / size);
  const col = cell % size;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    const run = [cell];
    for (const sign of [1, -1]) {
      for (let step = 1; step < IN_A_ROW; step += 1) {
        const r = row + dr * step * sign;
        const c = col + dc * step * sign;
        if (r < 0 || r >= size || c < 0 || c >= size || owners[r * size + c] !== team) break;
        run.push(r * size + c);
      }
    }
    if (run.length >= IN_A_ROW) return run.sort((a, b) => a - b);
  }
  return null;
}

/** Picks a board of words with different meanings and answers. */
function newBoard(words: VocabWord[], size: number, asked: number[], random: () => number): { cells: CaroCell[]; asked: number[] } {
  const cells: CaroCell[] = [];
  let history = asked;
  for (let tries = 0; cells.length < size * size && tries < words.length * 3; tries += 1) {
    const pick = pickUnasked(words.length, history, random);
    history = pick.asked;
    const word = words[pick.index] as VocabWord;
    const clash = cells.some((cell) => cell.word.meaning === word.meaning || cell.word.answers.some((answer) => word.answers.includes(answer)));
    if (!clash) cells.push({ word, owner: null, claimer: null });
  }
  return { cells, asked: history };
}

/** "c _ _" for English words (Japanese / Chinese have no such hint). */
function letterHint(word: VocabWord, lang: VocabLang): string | undefined {
  if (lang !== 'en') return undefined;
  return word.term.split(' ').map((part) => `${part[0] ?? ''}${' _'.repeat(Math.max(0, part.length - 1))}`).join('  ');
}

function boardGrid(state: CaroRound): OverlayGrid {
  return {
    kind: 'words',
    columns: state.size,
    cells: state.cells.map((cell, index) => {
      const open = cell.owner != null || state.stage !== 'play';
      return {
        text: cell.word.meaning,
        label: String(index + 1),
        sub: cell.claimer?.nickname ?? (open ? cell.word.term : letterHint(cell.word, state.lang)),
        // The winning line flashes gold while the board result is shown.
        state: state.line?.includes(index) ? 'found' : cell.owner === 0 ? 'red' : cell.owner === 1 ? 'blue' : 'idle'
      };
    })
  };
}

function matchWinner(state: CaroRound): Team | null {
  if (state.wins[0] === state.wins[1]) return null;
  return state.wins[0] > state.wins[1] ? 0 : 1;
}

export const teamCaroGame: GameDefinition<CaroRound, CaroConfig> = {
  id: 'coCaro',
  title: 'Cờ caro Đỏ – Xanh ⭕',
  category: 'versus',
  accent: '#f43f5e',
  aliases: ['cocaro', 'caro', 'tictactoe'],
  howTo: 'Bàn cờ có các ô ghi nghĩa tiếng Việt. Vào phe Đỏ hoặc Xanh, rồi comment từ tiếng Anh / Nhật / Trung của một ô để chiếm ô đó cho phe mình. Phe nào có 3 ô thẳng hàng (ngang, dọc, chéo) thắng ván; thắng đủ số ván trước là thắng trận.',
  commands: [
    { usage: '!do / !xanh', description: 'Vào phe Đỏ hoặc Xanh (không đổi được)' },
    { usage: 'cat / ねこ / māo', description: 'Gõ từ của một ô để chiếm ô cho phe mình' }
  ],
  defaultConfig: { preset: 'en-kids', bank: '', size: 3, target: 2, boardSeconds: 90, showSeconds: 4, points: 10, winPoints: 20 },
  settings: [
    ...vocabSettings(),
    { key: 'size', label: 'Cỡ bàn cờ (ô mỗi cạnh)', type: 'number', min: 3, max: 5, hint: 'Luôn cần 3 ô thẳng hàng để thắng ván; bàn to hơn thì khó chặn hơn.' },
    { key: 'target', label: 'Số ván thắng để thắng trận', type: 'number', min: 1, max: 4 },
    { key: 'boardSeconds', label: 'Giây mỗi ván', type: 'number', min: 20, max: 600, hint: 'Hết giờ mà chưa ai có 3 ô thẳng hàng: phe nhiều ô hơn thắng ván.' },
    { key: 'showSeconds', label: 'Giây xem kết quả ván', type: 'number', min: 2, max: 15 },
    { key: 'points', label: 'Điểm mỗi ô chiếm được', type: 'number', min: 1, max: 10_000 },
    { key: 'winPoints', label: 'Điểm thưởng thắng ván (mỗi người góp ô)', type: 'number', min: 0, max: 10_000 }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkVocabBank(text) : null;
  },

  start(config, ctx) {
    const { lang, words } = vocabBank(config);
    const size = Math.min(5, Math.max(3, config.size));
    const board = newBoard(words, size, ctx.previous?.asked ?? [], ctx.random);
    if (board.cells.length < size * size) return { error: t('Cần ít nhất {n} từ có nghĩa khác nhau.', { n: size * size }) };
    return {
      state: { lang, size, cells: board.cells, board: 1, wins: [0, 0], stage: 'play', line: null, boardWinner: null, roster: new TeamRoster(), asked: board.asked },
      durationMs: config.boardSeconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat') return null;
    const roster = state.roster;
    const choice = teamChoice(input.text);
    if (choice != null) {
      if (roster.teamOf(input.user) != null) return { state, consumed: true };
      const team = choice === 'auto' ? roster.smaller() : choice;
      return { consumed: true, state: { ...state }, message: t('{name} vào {team}', { name: input.nickname, team: teamName(team) }), commit: () => roster.join(input.user, input.nickname, team) };
    }
    if (state.stage !== 'play') return null;
    const raw = commandArgument(input.text, ['caro', 'ans']);
    if (raw === null) return null;
    const answer = foldFor(state.lang)(raw);
    if (!answer) return null;
    const index = state.cells.findIndex((cell) => cell.owner == null && cell.word.answers.includes(answer));
    if (index < 0) return null;

    const team = roster.teamOf(input.user) ?? roster.smaller();
    const cells = state.cells.map((cell, i) => (i === index ? { ...cell, owner: team, claimer: { user: input.user, nickname: input.nickname } } : cell));
    const line = lineThrough(cells.map((cell) => cell.owner), state.size, index, team);
    const full = cells.every((cell) => cell.owner != null);
    const awards: PointAward[] = [{ user: input.user, nickname: input.nickname, points: config.points }];
    const effects: EffectInput[] = [{ kind: 'correct', text: `${team === 0 ? '🔴' : '🔵'} ${input.nickname}: ${state.cells[index]?.word.term ?? ''}`, user: input.nickname }];
    let next: CaroRound = { ...state, cells };
    if (line || full) {
      const winner: Team | null = line ? team : boardLeader(cells);
      next = endBoard(next, winner, line);
      if (winner != null) awards.push(...boardAwards(cells, winner, config));
    }
    return {
      consumed: true,
      state: next,
      awards,
      commit: () => {
        roster.join(input.user, input.nickname, team);
        roster.contribute(input.user, 1);
      },
      effects,
      endsAt: next.stage === 'show' ? ctx.now + config.showSeconds * 1000 : undefined,
      message: next.stage === 'show' ? boardMessage(next) : undefined
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'play') {
      const winner = boardLeader(state.cells);
      const next = endBoard(state, winner, null);
      return {
        consumed: false,
        state: next,
        awards: winner != null ? boardAwards(state.cells, winner, config) : [],
        endsAt: ctx.now + config.showSeconds * 1000,
        message: boardMessage(next)
      };
    }
    if (state.stage !== 'show') return null;
    if (Math.max(...state.wins) >= config.target || state.board >= MAX_BOARDS) return null;
    // A new board of words (asked keeps recent words out while the bank lasts).
    const board = newBoard(vocabBank(config).words, state.size, state.asked, ctx.random);
    return {
      consumed: false,
      state: { ...state, cells: board.cells, asked: board.asked, board: state.board + 1, stage: 'play', line: null, boardWinner: null },
      endsAt: ctx.now + config.boardSeconds * 1000,
      message: t('⭕ Ván {n} bắt đầu!', { n: state.board + 1 })
    };
  },

  finish(state) {
    const winner = matchWinner(state);
    const done: CaroRound = { ...state, stage: 'done' };
    if (winner == null) return { state: done, awards: [], message: t('⭕ Hòa {red} – {blue}!', { red: state.wins[0], blue: state.wins[1] }), effects: [{ kind: 'lose', text: t('🤝 Hòa!') }] };
    const heroes = [...state.roster.entries()]
      .filter(([, member]) => member.team === winner && member.contribution > 0)
      .map(([, member]) => member)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((member) => ({ nickname: member.nickname, value: t('{n} ô', { n: member.contribution }) }));
    const text = t('🏆 {team} thắng {red} – {blue}!', { team: teamName(winner), red: state.wins[0], blue: state.wins[1] });
    return { state: done, awards: [], message: text, effects: [heroes.length ? podiumOf(heroes, text) : { kind: 'win', text }] };
  },

  testActions(state) {
    if (state.stage !== 'play') return [];
    const open = state.cells.find((cell) => cell.owner == null);
    return [
      chatTest(t('Vào phe Đỏ'), '!do', 1),
      chatTest(t('Vào phe Xanh'), '!xanh', 1),
      chatTest(t('Trả lời sai'), 'hello', 2),
      ...(open ? [chatTest(t('Chiếm ô: {word}', { word: open.word.term }), open.word.term, 2)] : [])
    ];
  },

  view(state) {
    const lang = t(LANG_NAMES[state.lang]);
    return view({
      grid: boardGrid(state),
      headline: t('⭕ Ván {n} • 🔴 {red} – {blue} 🔵', { n: state.board, red: state.wins[0], blue: state.wins[1] }),
      hint: state.stage === 'play'
        ? t('Gõ từ {lang} của một ô để chiếm ô • 3 ô thẳng hàng thắng ván • !do / !xanh để vào phe', { lang })
        : state.stage === 'show' ? boardMessage(state) : '',
      teams: [
        { label: teamName(0), score: state.wins[0], members: state.roster.counts[0] },
        { label: teamName(1), score: state.wins[1], members: state.roster.counts[1] }
      ]
    });
  }
};

/** Board winner on time or a full board: the team with more squares (null = tie). */
function boardLeader(cells: CaroCell[]): Team | null {
  const red = cells.filter((cell) => cell.owner === 0).length;
  const blue = cells.filter((cell) => cell.owner === 1).length;
  return red === blue ? null : red > blue ? 0 : 1;
}

function endBoard(state: CaroRound, winner: Team | null, line: number[] | null): CaroRound {
  const wins: [number, number] = [...state.wins];
  if (winner != null) wins[winner] += 1;
  return { ...state, wins, stage: 'show', line, boardWinner: winner };
}

/** Win bonus for every member of the winning team who claimed a square on this board. */
function boardAwards(cells: CaroCell[], winner: Team, config: CaroConfig): PointAward[] {
  if (config.winPoints <= 0) return [];
  const seen = new Set<string>();
  const awards: PointAward[] = [];
  for (const cell of cells) {
    if (cell.owner !== winner || !cell.claimer || seen.has(cell.claimer.user)) continue;
    seen.add(cell.claimer.user);
    awards.push({ user: cell.claimer.user, nickname: cell.claimer.nickname, points: config.winPoints });
  }
  return awards;
}

function boardMessage(state: CaroRound): string {
  if (state.boardWinner == null) return t('⭕ Ván {n} hòa', { n: state.board });
  return state.line
    ? t('⭕ {team} có 3 ô thẳng hàng, thắng ván {n}!', { team: teamName(state.boardWinner), n: state.board })
    : t('⭕ {team} nhiều ô hơn, thắng ván {n}!', { team: teamName(state.boardWinner), n: state.board });
}
