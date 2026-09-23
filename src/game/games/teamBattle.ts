import type { PointAward } from '../engine';
import { chatTest, giftTest, likeTest, view, type GameDefinition } from '../types';

export interface TeamRound {
  names: [string, string];
  /** Team is locked on first join so viewers can't switch to the winning side. */
  members: Record<string, { nickname: string; team: 0 | 1; contribution: number }>;
  scores: [number, number];
}

type TeamConfig = { seconds: number; teamA: string; teamB: string; giftPoints: number; penalty: string };

const PARTICIPATION_POINTS = 1;
const WIN_BONUS = 2;

function winnerOf(state: TeamRound): 0 | 1 | null {
  if (state.scores[0] === state.scores[1]) return null;
  return state.scores[0] > state.scores[1] ? 0 : 1;
}

export const teamBattleGame: GameDefinition<TeamRound, TeamConfig> = {
  id: 'teamBattle',
  title: 'Team battle ⚔️',
  category: 'fun',
  howTo: 'Comment A hoặc B để vào đội (không đổi được). Tim và gift của thành viên cộng điểm cho đội. Đội thua chịu phạt.',
  defaultConfig: { seconds: 120, teamA: 'Đội Đỏ', teamB: 'Đội Xanh', giftPoints: 10, penalty: 'Đội thua hát tặng đội thắng 1 câu' },
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
      const text = input.text.trim().toUpperCase();
      if (text !== 'A' && text !== 'B') return null;
      if (state.members[input.user]) return { state, consumed: true };
      const team = text === 'A' ? 0 : 1;
      return {
        consumed: true,
        message: `${input.nickname} vào ${state.names[team]}`,
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
      ? `Hòa ${state.scores[0]} – ${state.scores[1]}!`
      : `${state.names[winner]} thắng ${state.scores[winner]} – ${state.scores[winner === 0 ? 1 : 0]}!${config.penalty ? ` ${config.penalty}` : ''}`;
    return { state, message, awards };
  },

  testActions() {
    // Likes/gifts only count for viewers who already joined a team.
    return [chatTest('Vào đội A', 'A', 2), chatTest('Vào đội B', 'B', 2), likeTest(10, 3), giftTest('Rose', 1)];
  },

  view(state, config) {
    const counts: [number, number] = [0, 0];
    for (const member of Object.values(state.members)) counts[member.team] += 1;
    return view({
      hint: `Comment A hoặc B để vào đội • Tim +1 • Gift +${config.giftPoints}`,
      teams: [
        { label: state.names[0], score: state.scores[0], members: counts[0] },
        { label: state.names[1], score: state.scores[1], members: counts[1] }
      ]
    });
  }
};
