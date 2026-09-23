import type { PointAward } from '../engine';
import { giftTest, likeTest, percentOf, ranked, view, type GameDefinition } from '../types';

export interface BossRound {
  maxHp: number;
  hp: number;
  damage: Record<string, { nickname: string; damage: number }>;
  /** Viewer who dealt the final blow, once the boss is defeated. */
  lastHit: { user: string; nickname: string } | null;
}

type BossConfig = { hp: number; seconds: number; giftDamage: number; reward: string };

const BOSS_POINTS = 1;
const BOSS_WIN_BONUS = 2;
const BOSS_LAST_HIT_BONUS = 5;

export function createBossRound(maxHp: number): BossRound {
  const hp = Math.max(1, Math.round(maxHp));
  return { maxHp: hp, hp, damage: {}, lastHit: null };
}

export function bossDefeated(round: BossRound): boolean {
  return round.hp <= 0;
}

export function hitBoss(round: BossRound, user: string, nickname: string, amount: number): BossRound {
  const hit = Math.floor(amount);
  if (bossDefeated(round) || !user || !Number.isFinite(hit) || hit <= 0) return round;

  const dealt = Math.min(hit, round.hp);
  const hp = round.hp - dealt;
  const old = round.damage[user];
  return {
    ...round,
    hp,
    damage: { ...round.damage, [user]: { nickname: nickname || old?.nickname || user, damage: (old?.damage ?? 0) + dealt } },
    lastHit: hp <= 0 ? { user, nickname: nickname || user } : null
  };
}

export function topAttackers(round: BossRound, limit = 3) {
  return ranked(Object.entries(round.damage).map(([user, entry]) => ({ user, ...entry })), (item) => item.damage).slice(0, limit);
}

/** Every attacker +1; if the boss dies, +2 more each and +5 for the final blow. */
export function bossAwards(round: BossRound): PointAward[] {
  const won = bossDefeated(round);
  return Object.entries(round.damage).map(([user, entry]) => ({
    user,
    nickname: entry.nickname,
    points: BOSS_POINTS + (won ? BOSS_WIN_BONUS : 0) + (won && round.lastHit?.user === user ? BOSS_LAST_HIT_BONUS : 0)
  }));
}

export const bossGame: GameDefinition<BossRound, BossConfig> = {
  id: 'boss',
  title: 'Đánh boss 👾',
  category: 'fun',
  howTo: 'Thả tim = 1 dmg, gift = nhiều dmg. Hạ boss trước khi hết giờ để streamer làm phần thưởng. Tham gia +1, hạ boss +2, đòn kết liễu +5.',
  defaultConfig: { hp: 300, seconds: 90, giftDamage: 20, reward: 'Streamer hát 1 bài theo yêu cầu' },
  settings: [
    { key: 'hp', label: 'Máu boss', type: 'number', min: 10, max: 100_000 },
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 10, max: 600 },
    { key: 'giftDamage', label: 'Dmg mỗi gift', type: 'number', min: 1, max: 10_000 },
    { key: 'reward', label: 'Phần thưởng', type: 'text', maxLength: 80 }
  ],

  start(config) {
    return { state: createBossRound(config.hp), durationMs: config.seconds * 1000 };
  },

  handle(state, input, config) {
    if (input.kind === 'chat') return null;
    const damage = Math.max(1, input.count) * (input.kind === 'like' ? 1 : config.giftDamage);
    const next = hitBoss(state, input.user, input.nickname, damage);
    return { state: next, consumed: false, finish: bossDefeated(next) };
  },

  finish(state, config) {
    const message = bossDefeated(state)
      ? `Boss đã bị hạ! Đòn kết liễu: ${state.lastHit?.nickname ?? '?'}.${config.reward ? ` 🎁 ${config.reward}` : ''}`
      : `Boss thắng, còn ${state.hp}/${state.maxHp} HP`;
    return { state, message, awards: bossAwards(state) };
  },

  testActions() {
    return [likeTest(10, 3), likeTest(50), giftTest('Rose', 1), giftTest('Rose', 5, 0.3)];
  },

  view(state, config) {
    const attackers = topAttackers(state);
    const top = attackers[0]?.damage ?? 0;
    return view({
      hint: `Thả tim = 1 dmg • Gift = ${config.giftDamage} dmg`,
      progress: { label: 'HP Boss', value: state.hp, max: state.maxHp },
      rows: attackers.map((attacker, index) => ({
        badge: String(index + 1),
        label: attacker.nickname,
        value: `${attacker.damage} dmg`,
        percent: percentOf(attacker.damage, top)
      }))
    });
  }
};
