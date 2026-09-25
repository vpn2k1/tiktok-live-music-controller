import { t } from '../../shared/i18n';
import { podiumOf } from '../series';
import type { EffectInput, PointAward } from '../engine';
import { isBangCommand, teamChoice, TeamRoster, type Team } from '../teamRoster';
import { chatTest, giftTest, likeTest, percentOf, view, type GameDefinition, type GameInput } from '../types';

/**
 * Thành trì Đỏ – Xanh: two teams shoot at each other's castle. `!ban`, likes and
 * gifts damage the enemy castle, `!sua` repairs your own; a castle at 0 HP loses.
 */
export interface CastleRound {
  maxHp: number;
  hp: [number, number];
  roster: TeamRoster;
  /** Team whose castle fell (the round is decided). */
  fallen: Team | null;
}

type CastleConfig = { seconds: number; hp: number; shotDamage: number; likeDamage: number; giftDamage: number; repair: number };

const TEAM_NAMES: [string, string] = ['Phe Đỏ', 'Phe Xanh'];
const TEAM_BADGES: [string, string] = ['🔴', '🔵'];
const SHOT_NAMES = ['ban', 'fire', 'attack'];
const REPAIR_NAMES = ['sua', 'repair'];

const PARTICIPATION_POINTS = 2;
const WIN_BONUS = 5;
const MVP_BONUS = 10;

function teamName(team: Team): string {
  return t(TEAM_NAMES[team]);
}

/** Winning team: the one still standing, else the one with more HP left (null = draw). */
export function castleWinner(state: CastleRound): Team | null {
  if (state.fallen != null) return state.fallen === 0 ? 1 : 0;
  if (state.hp[0] === state.hp[1]) return null;
  return state.hp[0] > state.hp[1] ? 0 : 1;
}

/** Damage from a viewer (joining the smaller team first if they haven't picked one). */
function attack(state: CastleRound, input: GameInput, amount: number): { state: CastleRound; finish: boolean; dealt: number; commit: () => void } {
  const team = state.roster.teamOf(input.user) ?? state.roster.smaller();
  const enemy: Team = team === 0 ? 1 : 0;
  const dealt = Math.min(Math.max(0, Math.floor(amount)), state.hp[enemy]);
  const hp: [number, number] = [...state.hp];
  hp[enemy] -= dealt;
  const fallen = hp[enemy] <= 0 ? enemy : null;
  const roster = state.roster;
  return {
    state: { ...state, hp, fallen },
    finish: fallen != null,
    dealt,
    commit: () => {
      roster.join(input.user, input.nickname, team);
      roster.contribute(input.user, dealt);
    }
  };
}

export const castleSiegeGame: GameDefinition<CastleRound, CastleConfig> = {
  id: 'thanhTri',
  title: 'Thành trì Đỏ – Xanh 🏰',
  category: 'versus',
  accent: '#ef4444',
  aliases: ['thanhtri', 'castle', 'siege'],
  howTo: 'Hai phe công thành: chọn phe Đỏ hoặc Xanh, rồi bắn thành địch bằng !ban, thả tim hoặc tặng quà; !sua để sửa thành mình. Thành nào về 0 máu trước thì thua; hết giờ phe còn nhiều máu hơn thắng.',
  commands: [
    { usage: '!do / !xanh', description: 'Vào phe Đỏ hoặc Xanh (không đổi được)' },
    { usage: '!ban', description: 'Bắn thành phe địch' },
    { usage: '!sua', description: 'Sửa thành phe mình' },
    { usage: 'Thả tim / tặng quà', description: 'Tim bắn nhẹ, quà bắn cực mạnh' }
  ],
  defaultConfig: { seconds: 180, hp: 600, shotDamage: 5, likeDamage: 1, giftDamage: 50, repair: 3 },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 30, max: 1800 },
    { key: 'hp', label: 'Máu mỗi thành', type: 'number', min: 50, max: 1_000_000, hint: 'Phòng đông thì tăng lên (tim và quà trừ máu rất nhanh).' },
    { key: 'shotDamage', label: 'Sát thương mỗi !ban', type: 'number', min: 1, max: 1000 },
    { key: 'likeDamage', label: 'Sát thương mỗi tim', type: 'number', min: 0, max: 1000 },
    { key: 'giftDamage', label: 'Sát thương mỗi quà', type: 'number', min: 0, max: 100_000 },
    { key: 'repair', label: 'Máu hồi mỗi !sua', type: 'number', min: 0, max: 1000 }
  ],

  start(config) {
    const hp = Math.max(1, config.hp);
    return { state: { maxHp: hp, hp: [hp, hp], roster: new TeamRoster(), fallen: null }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, config) {
    if (state.fallen != null) return input.kind === 'chat' && (teamChoice(input.text) != null || isBangCommand(input.text, [...SHOT_NAMES, ...REPAIR_NAMES])) ? { state, consumed: true } : null;
    const roster = state.roster;

    if (input.kind === 'chat') {
      const choice = teamChoice(input.text);
      if (choice != null) {
        if (roster.teamOf(input.user) != null) return { state, consumed: true };
        const team = choice === 'auto' ? roster.smaller() : choice;
        return {
          consumed: true,
          state: { ...state },
          message: t('{name} vào {team}', { name: input.nickname, team: teamName(team) }),
          commit: () => roster.join(input.user, input.nickname, team)
        };
      }
      if (isBangCommand(input.text, REPAIR_NAMES)) {
        const team = roster.teamOf(input.user) ?? roster.smaller();
        const healed = Math.min(config.repair, state.maxHp - state.hp[team]);
        const hp: [number, number] = [...state.hp];
        hp[team] += healed;
        return {
          consumed: true,
          state: { ...state, hp },
          commit: () => {
            roster.join(input.user, input.nickname, team);
            roster.contribute(input.user, healed);
          }
        };
      }
      if (!isBangCommand(input.text, SHOT_NAMES)) return null;
      const shot = attack(state, input, config.shotDamage);
      return { consumed: true, state: shot.state, commit: shot.commit, finish: shot.finish };
    }

    const perUnit = input.kind === 'gift' ? config.giftDamage : config.likeDamage;
    if (perUnit <= 0) return null;
    const hit = attack(state, input, perUnit * Math.max(1, input.count));
    // Gifts are rare and worth a pop; likes stream too fast for per-event effects.
    const effects: EffectInput[] | undefined = input.kind === 'gift' && hit.dealt > 0 ? [{ kind: 'hit', text: `-${hit.dealt}`, user: input.nickname }] : undefined;
    return { consumed: false, state: hit.state, commit: hit.commit, finish: hit.finish, effects };
  },

  finish(state) {
    const winner = castleWinner(state);
    const mvp = winner == null ? null : state.roster.best(winner);
    const awards: PointAward[] = [];
    for (const [user, member] of state.roster.entries()) {
      if (member.contribution <= 0) continue;
      awards.push({
        user,
        nickname: member.nickname,
        points: PARTICIPATION_POINTS + (member.team === winner ? WIN_BONUS : 0) + (mvp?.user === user ? MVP_BONUS : 0)
      });
    }
    if (winner == null) {
      return { state, awards, message: t('🏰 Hòa! Hai thành còn {hp} máu.', { hp: state.hp[0] }), effects: [{ kind: 'lose', text: t('🤝 Hòa!') }] };
    }
    const message = mvp
      ? t('🏰 {team} thắng! MVP: {name} ({n} điểm công/thủ)', { team: teamName(winner), name: mvp.nickname, n: mvp.contribution })
      : t('🏰 {team} thắng!', { team: teamName(winner) });
    // The winning team's top 3 attackers/defenders on the podium.
    const heroes = [...state.roster.entries()]
      .filter(([, member]) => member.team === winner && member.contribution > 0)
      .map(([, member]) => member)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((member) => ({ nickname: member.nickname, value: t('{n} điểm công/thủ', { n: member.contribution }) }));
    return {
      state,
      awards,
      message,
      effects: [heroes.length ? podiumOf(heroes, t('🏆 {team} thắng!', { team: teamName(winner) })) : { kind: 'win', text: t('🏆 {team} thắng!', { team: teamName(winner) }) }]
    };
  },

  testActions() {
    return [
      chatTest(t('Vào phe Đỏ'), '!do', 1),
      chatTest(t('Vào phe Xanh'), '!xanh', 1),
      chatTest('!ban', '!ban', 3),
      chatTest('!sua', '!sua', 1),
      likeTest(10, 3),
      giftTest('Rose', 1, 0.3)
    ];
  },

  view(state, config) {
    const leader = state.hp[0] === state.hp[1] ? null : state.hp[0] > state.hp[1] ? 0 : 1;
    return view({
      headline: state.fallen != null ? t('💥 Thành {team} đã sập!', { team: teamName(state.fallen) }) : '🏰 ⚔️ 🏰',
      hint: t('!ban / tim bắn thành địch (-{shot} / -{like}) • Quà -{gift} • !sua +{repair}', {
        shot: config.shotDamage,
        like: config.likeDamage,
        gift: config.giftDamage,
        repair: config.repair
      }),
      rows: ([0, 1] as Team[]).map((team) => ({
        badge: TEAM_BADGES[team],
        label: t('{team} · {n} người', { team: teamName(team), n: state.roster.counts[team] }),
        value: `${state.hp[team]} / ${state.maxHp}`,
        percent: percentOf(state.hp[team], state.maxHp),
        highlight: team === leader
      }))
    });
  }
};
