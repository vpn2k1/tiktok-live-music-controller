import type { AudioTrack } from '../../shared/types';
import type { PointAward } from '../engine';
import { chatTest, percentOf, shuffle, view, type GameDefinition } from '../types';

export interface VoteOption {
  /** Track id, not index: the playlist can change while a vote is running. */
  trackId: string;
  label: string;
}

export interface VoteRound {
  options: VoteOption[];
  /** One ballot per viewer; a later valid vote replaces the earlier one. */
  ballots: Record<string, { nickname: string; choice: number }>;
  winner: number | null;
}

type VoteConfig = { seconds: number };

export const VOTE_OPTION_COUNT = 3;
const VOTE_POINTS = 1;
const VOTE_WINNER_BONUS = 2;

function trackTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

/** Picks up to 3 tracks, preferring ones that are not currently playing. */
export function createVoteRound(playlist: AudioTrack[], currentTrackId: string | null, random: () => number): VoteRound | null {
  if (playlist.length < 2) return null;
  const others = playlist.filter((track) => track.id !== currentTrackId);
  const pool = others.length >= 2 ? others : playlist;
  const options = shuffle(pool, random)
    .slice(0, VOTE_OPTION_COUNT)
    .map((track) => ({ trackId: track.id, label: trackTitle(track.name) }));
  return { options, ballots: {}, winner: null };
}

/** 0-based choice for an exact single-digit comment ("1".."3"), else null. */
export function parseVote(round: VoteRound, text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d$/.test(trimmed)) return null;
  const choice = Number(trimmed) - 1;
  return choice >= 0 && choice < round.options.length ? choice : null;
}

export function tallyVotes(round: VoteRound): number[] {
  const counts = round.options.map(() => 0);
  for (const ballot of Object.values(round.ballots)) {
    counts[ballot.choice] = (counts[ballot.choice] ?? 0) + 1;
  }
  return counts;
}

/** Winner option index; ties are broken randomly. Null when nobody voted. */
export function pickWinner(round: VoteRound, random: () => number): number | null {
  const counts = tallyVotes(round);
  const best = Math.max(0, ...counts);
  if (best === 0) return null;
  const tied = counts.flatMap((count, index) => (count === best ? [index] : []));
  return tied[Math.floor(random() * tied.length)] ?? null;
}

export function voteAwards(round: VoteRound, winner: number | null): PointAward[] {
  return Object.entries(round.ballots).map(([user, ballot]) => ({
    user,
    nickname: ballot.nickname,
    points: VOTE_POINTS + (ballot.choice === winner ? VOTE_WINNER_BONUS : 0)
  }));
}

export const voteGame: GameDefinition<VoteRound, VoteConfig> = {
  id: 'vote',
  title: 'Vote bài tiếp theo',
  category: 'fun',
  howTo: 'Viewer comment 1/2/3 để chọn bài. Hết giờ bài nhiều phiếu nhất được phát. Vote +1 điểm, vote trúng +2.',
  defaultConfig: { seconds: 30 },
  settings: [{ key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 10, max: 600 }],

  start(config, ctx) {
    const round = createVoteRound(ctx.playlist, ctx.currentTrackId, ctx.random);
    if (!round) return { error: 'Cần ít nhất 2 bài trong playlist để vote.' };
    return { state: round, durationMs: config.seconds * 1000 };
  },

  handle(state, input) {
    if (input.kind !== 'chat' || !/^\d+$/.test(input.text.trim())) return null;
    // While voting, every digit-only comment is treated as a ballot attempt.
    const choice = parseVote(state, input.text);
    if (choice === null || state.ballots[input.user]?.choice === choice) return { state, consumed: true };
    return {
      state: { ...state, ballots: { ...state.ballots, [input.user]: { nickname: input.nickname, choice } } },
      consumed: true
    };
  },

  finish(state, _config, ctx) {
    const winner = pickWinner(state, ctx.random);
    const option = winner === null ? null : state.options[winner] ?? null;
    const message = option && winner !== null
      ? `Bài thắng: ${option.label} (${tallyVotes(state)[winner] ?? 0} phiếu)`
      : 'Không ai vote, giữ bài hiện tại.';
    return {
      state: { ...state, winner },
      message,
      awards: voteAwards(state, winner),
      playTrackId: option?.trackId
    };
  },

  testActions(state) {
    return state.options.map((_, index) => chatTest(`Vote ${index + 1}`, String(index + 1)));
  },

  view(state) {
    const counts = tallyVotes(state);
    const total = counts.reduce((sum, count) => sum + count, 0);
    return view({
      hint: `Comment 1–${state.options.length} để chọn bài`,
      rows: state.options.map((option, index) => ({
        badge: String(index + 1),
        label: option.label,
        value: String(counts[index] ?? 0),
        percent: percentOf(counts[index] ?? 0, total),
        highlight: state.winner === index
      }))
    });
  }
};
