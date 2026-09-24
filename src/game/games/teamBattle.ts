import { t } from '../../shared/i18n';
import type { PointAward } from '../engine';
import { chatTest, commandArgument, giftTest, likeTest, view, type GameDefinition } from '../types';

export interface TeamRound {
  names: [string, string];
  /** Team is locked on first join so viewers can't switch to the winning side. */
  members: Record<string, { nickname: string; team: 0 | 1; contribution: number }>;
  scores: [number, number];
}

type TeamConfig = { seconds: number; teamA: string; teamB: string; giftPoints: number; penalty: string };

const PARTICIPATION_POINTS = 1;

const DEFAULT_PENALTY = 'Đội thua hát tặng đội thắng 1 câu';
/** Built-in team names follow the app language; host-written ones are shown as is. */
const DEFAULT_NAMES = new Set(['Đội Đỏ', 'Đội Xanh', 'Đội A', 'Đội B']);

function teamName(name: string | undefined): string {
  return name && DEFAULT_NAMES.has(name) ? t(name) : name ?? '';
}
const WIN_BONUS = 2;

function winnerOf(state: TeamRound): 0 | 1 | null {
  if (state.scores[0] === state.scores[1]) return null;
  return state.scores[0] > state.scores[1] ? 0 : 1;
}

export const teamBattleGame: GameDefinition<TeamRound, TeamConfig> = {
  id: 'teamBattle',
  title: 'Team battle ⚔️',
  category: 'fun',
  accent: '#a855f7',
  howTo: 'Comment A hoặc B để vào đội (không đổi được). Tim và gift của thành viên cộng điểm cho đội. Đội thua chịu phạt.',
  commands: [
    { usage: 'A / B', description: 'Vào đội A hoặc B' },
    { usage: '!join a / !join b', description: 'Cách viết khác' },
    { usage: '!join', description: 'Vào đội đang ít người hơn' },
    { usage: 'Thả tim / gift', description: 'Cộng điểm cho đội mình' }
  ],
  aliases: ['team'],
  defaultConfig: { seconds: 120, teamA: 'Đội Đỏ', teamB: 'Đội Xanh', giftPoints: 10, penalty: DEFAULT_PENALTY },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 10, max: 900 },
    { key: 'teamA', label: 'Tên đội A', type: 'text', maxLength: 24 },
    { key: 'teamB', label: 'Tên đội B', type: 'text', maxLength: 24 },
    { key: 'giftPoints', label: 'Điểm mỗi gift', type: 'number', min: 1, max: 10_000 },
    { key: 'penalty', label: 'Hình phạt', type: 'text', maxLength: 80 }
  ],

  start(config) {
    return {
      state: { names: [config.teamA || 'Đội A', config.teamB || 'Đội B'], members: {}, scores: [0, 0] },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config) {
    if (input.kind === 'chat') {
      const joinArg = commandArgument(input.text, ['join', 'team']);
      const shortcut = commandArgument(input.text, ['a', 'b']);
      let choice: string | null = null;
      if (input.text.trim().startsWith('!')) {
        if (joinArg !== null) choice = joinArg.trim().toUpperCase() || 'AUTO';
        else if (shortcut === '') choice = input.text.trim().slice(1).toUpperCase();
      } else {
        choice = input.text.trim().toUpperCase();
      }
      if (choice !== 'A' && choice !== 'B' && choice !== 'AUTO') return null;
      if (state.members[input.user]) return { state, consumed: true };
      let team: 0 | 1 = choice === 'A' ? 0 : 1;
      if (choice === 'AUTO') {
        const counts = [0, 0];
        for (const member of Object.values(state.members)) counts[member.team] += 1;
        team = (counts[0] ?? 0) <= (counts[1] ?? 0) ? 0 : 1;
      }
      return {
        consumed: true,
        message: t('{name} vào {team}', { name: input.nickname, team: teamName(state.names[team]) }),
        state: { ...state, members: { ...state.members, [input.user]: { nickname: input.nickname, team, contribution: 0 } } }
      };
    }

    const member = state.members[input.user];
    if (!member) return null;
    const amount = Math.max(1, input.count) * (input.kind === 'gift' ? config.giftPoints : 1);
    const scores: [number, number] = [...state.scores];
    scores[member.team] += amount;
    return {
      consumed: false,
      // Gifts are rare and worth a pop; likes stream too fast for per-event effects.
      effects: input.kind === 'gift' ? [{ kind: 'score', text: `+${amount} ${teamName(state.names[member.team])}`, user: input.nickname }] : undefined,
      state: {
        ...state,
        scores,
        members: { ...state.members, [input.user]: { ...member, contribution: member.contribution + amount } }
      }
    };
  },

  finish(state, config) {
    const winner = winnerOf(state);
    const awards: PointAward[] = Object.entries(state.members)
      .filter(([, member]) => member.contribution > 0)
      .map(([user, member]) => ({
        user,
        nickname: member.nickname,
        points: PARTICIPATION_POINTS + (member.team === winner ? WIN_BONUS : 0)
      }));
    const message = winner === null
      ? t('Hòa {a} – {b}!', { a: state.scores[0], b: state.scores[1] })
      : t('{team} thắng {a} – {b}!', { team: teamName(state.names[winner]), a: state.scores[winner], b: state.scores[winner === 0 ? 1 : 0] })
        + (config.penalty ? ` ${config.penalty === DEFAULT_PENALTY ? t(DEFAULT_PENALTY) : config.penalty}` : '');
    return { state, message, awards };
  },

  testActions() {
    // Likes/gifts only count for viewers who already joined a team.
    return [chatTest(t('Vào đội A'), 'A', 2), chatTest('!join b', '!join b', 1), chatTest('!join', '!join', 1), likeTest(10, 3), giftTest('Rose', 1)];
  },

  view(state, config) {
    const counts: [number, number] = [0, 0];
    for (const member of Object.values(state.members)) counts[member.team] += 1;
    return view({
      hint: t('Comment A / B hoặc !join để vào đội • Tim +1 • Gift +{n}', { n: config.giftPoints }),
      teams: [
        { label: teamName(state.names[0]), score: state.scores[0], members: counts[0] },
        { label: teamName(state.names[1]), score: state.scores[1], members: counts[1] }
      ]
    });
  }
};
