import { checkBankLines } from '../bankFile';
import type { PointAward } from '../engine';
import { Scoreboard } from '../scoreboard';
import { giftTest, likeTest, view, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';

/**
 * "Thử thách tim": the whole room fills a heart meter together. Each milestone
 * unlocks a challenge for the streamer; reaching the target ends the round.
 * Top likers score at the end. Rewards are streamer challenges, never prizes.
 */
export interface Milestone {
  likes: number;
  reward: string;
}

export interface LikeRound {
  total: number;
  milestones: Milestone[];
  /** Milestones already announced. */
  reached: number;
  /** Likes per viewer (mutable, written in `commit`). */
  likers: Scoreboard;
}

type LikeConfig = { seconds: number; giftLikes: number; likesPerPoint: number; milestones: string };

export const DEFAULT_MILESTONES = [
  '100 | Streamer nói "cảm ơn" bằng 3 thứ tiếng',
  '300 | Streamer hát 1 câu',
  '500 | Streamer nhảy 15 giây',
  '800 | Streamer làm mặt xấu 5 giây',
  '1000 | Streamer đọc tên top 3 thả tim'
].join('\n');

export function parseMilestones(text: string): Milestone[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const [count = '', reward = ''] = line.split('|').map((part) => part.trim());
      const likes = Number(count.replace(/[.,\s]/g, ''));
      return Number.isInteger(likes) && likes > 0 && likes <= 10_000_000 && reward ? [{ likes, reward: reward.slice(0, 80) }] : [];
    })
    .sort((a, b) => a.likes - b.likes)
    .slice(0, 12);
}

function target(state: LikeRound): number {
  return state.milestones[state.milestones.length - 1]?.likes ?? 1;
}

export const likeChallengeGame: GameDefinition<LikeRound, LikeConfig> = {
  id: 'thuThachTim',
  title: 'Thử thách tim ❤️',
  category: 'fun',
  accent: '#ec4899',
  aliases: ['thuthachtim', 'likegoal', 'tim'],
  howTo: 'Cả phòng cùng thả tim để lấp đầy thanh ❤️ (quà cũng tính thành tim). Mỗi mốc mở khóa một thử thách cho streamer; đạt mốc cuối là thắng. Người thả nhiều tim nhất được điểm.',
  commands: [
    { usage: 'Thả tim ❤️', description: 'Mỗi tim đẩy thanh lên' },
    { usage: 'Tặng quà 🎁', description: 'Mỗi quà = nhiều tim' }
  ],
  defaultConfig: { seconds: 300, giftLikes: 20, likesPerPoint: 10, milestones: DEFAULT_MILESTONES },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 30, max: 3600 },
    { key: 'giftLikes', label: 'Mỗi quà = bao nhiêu tim', type: 'number', min: 0, max: 100_000 },
    { key: 'likesPerPoint', label: 'Số tim = 1 điểm', type: 'number', min: 1, max: 10_000 },
    {
      key: 'milestones',
      label: 'Các mốc thử thách',
      type: 'textarea',
      maxLength: 5000,
      hint: 'Mỗi dòng: số tim | thử thách của streamer (tối đa 12 mốc). Mốc lớn nhất là đích.',
      sample: ['# Mẫu mốc Thử thách tim — mỗi dòng 1 mốc:', '# số tim | thử thách của streamer', '200 | Streamer hát 1 câu', '500 | Streamer nhảy 15 giây'].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'milestones' ? checkBankLines(text, (line) => parseMilestones(line).length === 1) : null;
  },

  start(config) {
    // Default rewards follow the app language; the host's own lines have no entry and stay as typed.
    const milestones = parseMilestones(config.milestones).map((milestone) => ({ ...milestone, reward: t(milestone.reward) }));
    if (!milestones.length) return { error: t('Chưa có mốc hợp lệ (vd: 300 | Streamer hát 1 câu).') };
    return { state: { total: 0, milestones, reached: 0, likers: new Scoreboard() }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, config) {
    if (input.kind === 'chat') return null;
    const added = input.kind === 'like' ? input.count : input.count * config.giftLikes;
    if (added <= 0 || state.total >= target(state)) return null;
    const total = state.total + added;
    const crossed = state.milestones.filter((milestone, index) => index >= state.reached && total >= milestone.likes);
    const reached = state.reached + crossed.length;
    const latest = crossed[crossed.length - 1];
    return {
      consumed: false,
      finish: total >= target(state),
      message: latest ? t('🎉 Đạt {likes} tim: {reward}!', { likes: latest.likes.toLocaleString(numberLocale()), reward: latest.reward }) : undefined,
      effects: latest ? [{ kind: 'score', text: `🎉 ${latest.reward}` }] : [{ kind: 'score', text: `❤️ +${added}`, user: input.nickname }],
      state: { ...state, total, reached },
      commit: () => state.likers.add(input.user, input.nickname, added)
    };
  },

  finish(state, config) {
    const top = state.likers.top(20);
    const awards: PointAward[] = top.map((entry) => ({ user: entry.user, nickname: entry.nickname, points: Math.ceil(entry.points / config.likesPerPoint) }));
    const done = state.total >= target(state);
    return {
      state,
      awards,
      message: done
        ? `${t('🏆 Hoàn thành thử thách {likes} tim!', { likes: target(state).toLocaleString(numberLocale()) })}${top[0] ? ` ${t('Thả nhiều nhất: {name}', { name: top[0].nickname })}` : ''}`
        : t('⏰ Hết giờ: {total}/{target} tim, mở được {reached} mốc.', {
          total: state.total.toLocaleString(numberLocale()),
          target: target(state).toLocaleString(numberLocale()),
          reached: state.reached
        }),
      effects: [done ? { kind: 'win', text: t('❤️ Hoàn thành!'), user: top[0]?.nickname } : { kind: 'lose', text: `❤️ ${state.total}` }]
    };
  },

  testActions() {
    return [likeTest(30, 4), likeTest(120, 1), giftTest('Rose', 3, 0.5)];
  },

  view(state) {
    const next = state.milestones[state.reached];
    const leader = state.likers.top(1)[0];
    return view({
      headline: `❤️ ${state.total.toLocaleString(numberLocale())} / ${target(state).toLocaleString(numberLocale())}`,
      hint: next ? t('Mốc tiếp: {likes} tim → {reward}', { likes: next.likes.toLocaleString(numberLocale()), reward: next.reward }) : t('🏆 Đã hoàn thành mọi mốc!'),
      progress: { label: leader ? t('👑 {name} thả nhiều nhất', { name: leader.nickname }) : t('❤️ Tim cả phòng'), value: Math.min(state.total, target(state)), max: target(state) },
      // The milestones are the board; the top liker is on the meter (all likers score at the end).
      rows: state.milestones.map((milestone, index) => ({
        badge: index < state.reached ? '✅' : '🔒',
        label: milestone.reward,
        value: milestone.likes.toLocaleString(numberLocale()),
        highlight: index === state.reached - 1
      }))
    });
  }
};
