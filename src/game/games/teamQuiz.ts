import { numberLocale, t } from '../../shared/i18n';
import { checkBankLines } from '../bankFile';
import type { PointAward } from '../engine';
import {
  current,
  nextQuestion,
  pickSet,
  podiumEffect,
  progressLabel,
  rankingRows,
  resultHint,
  scoreQuestion,
  SERIES_SETTINGS,
  startSeries,
  type SeriesConfig,
  type SeriesState
} from '../series';
import { teamChoice, TeamRoster, type Team } from '../teamRoster';
import { chatTest, percentOf, view, type GameDefinition } from '../types';
import { parseQuestions, QUIZ_PRESETS, QUIZ_SAMPLE, quizBank, type QuizQuestion } from './quiz';

/**
 * Quiz đối kháng Đỏ – Xanh: the A–D quiz, played by two teams. Each viewer's
 * speed points go to them and to their team; the team with more points wins
 * and its members get a bonus. Viewers pick a side with !do / !xanh, or join
 * the smaller team with their first answer.
 */
export type TeamQuizRound = SeriesState<QuizQuestion> & {
  roster: TeamRoster;
  teamScores: [number, number];
  /** Points each team got on the last revealed question. */
  lastGain: [number, number];
};

type TeamQuizConfig = SeriesConfig & { preset: string; questions: string; teamBonus: number };

const LETTERS = ['A', 'B', 'C', 'D'];
const TEAM_NAMES: [string, string] = ['Phe Đỏ', 'Phe Xanh'];

function teamName(team: Team): string {
  return t(TEAM_NAMES[team]);
}

function count(value: number): string {
  return value.toLocaleString(numberLocale());
}

/** Speed points of a question, per team (by the team each scorer is on). */
export function teamGains(roster: TeamRoster, awards: PointAward[]): [number, number] {
  const gains: [number, number] = [0, 0];
  for (const award of awards) {
    const team = roster.teamOf(award.user);
    if (team != null) gains[team] += award.points;
  }
  return gains;
}

function winnerOf(scores: [number, number]): Team | null {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

export const teamQuizGame: GameDefinition<TeamQuizRound, TeamQuizConfig> = {
  id: 'quizDoi',
  title: 'Quiz Đỏ – Xanh 🆚',
  category: 'versus',
  accent: '#6366f1',
  aliases: ['quizdoi', 'teamquiz', 'quizteam'],
  howTo: 'Hai phe thi trả lời: chọn phe bằng !do / !xanh (hoặc trả lời luôn để vào phe ít người hơn), rồi comment a, b, c, d. Đúng càng nhanh càng nhiều điểm cho mình và cho phe. Hết lượt, phe nhiều điểm hơn thắng và mọi thành viên được thưởng.',
  commands: [
    { usage: '!do / !xanh', description: 'Chọn phe Đỏ hoặc Xanh (không đổi được)' },
    { usage: 'a / b / c / d', description: 'Chọn đáp án (chỉ tính lần đầu)' }
  ],
  defaultConfig: { count: 10, seconds: 15, maxPoints: 100, reveal: 4, order: 'random', preset: 'en-easy', questions: '', teamBonus: 50 },
  settings: [
    {
      key: 'preset',
      label: 'Bộ câu hỏi có sẵn',
      type: 'select',
      options: Object.entries(QUIZ_PRESETS).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseQuestions(preset.bank).length} câu` }))
    },
    ...SERIES_SETTINGS,
    { key: 'teamBonus', label: 'Thưởng mỗi thành viên phe thắng', type: 'number', min: 0, max: 10_000 },
    {
      key: 'questions',
      label: 'Câu hỏi riêng (tuỳ chọn)',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Để trống = dùng bộ câu hỏi có sẵn ở trên. Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). 2–4 lựa chọn. Nhập được file .txt / .csv (Excel, Google Sheets).',
      sample: QUIZ_SAMPLE
    }
  ],

  checkBank(key, text) {
    return key === 'questions' ? checkBankLines(text, (line) => parseQuestions(line).length === 1) : null;
  },

  start(config, ctx) {
    const bank = quizBank(config);
    if (!bank.length) return { error: t('Bộ câu hỏi trống hoặc sai định dạng.') };
    const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
    const items = indices.map((index) => bank[index] as QuizQuestion);
    const series = startSeries(items, asked, ctx.now, items[0]?.answers.length);
    return { state: { ...series, roster: new TeamRoster(), teamScores: [0, 0], lastGain: [0, 0] }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, _config, ctx) {
    if (input.kind !== 'chat') return null;
    const roster = state.roster;
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
    if (state.stage !== 'ask') return null;
    const question = current(state);
    const letter = LETTERS.indexOf(input.text.trim().toUpperCase());
    if (letter < 0 || letter >= question.answers.length) return null;
    if (state.book.has(input.user)) return { state, consumed: true };
    // No side yet: the first answer joins the smaller team.
    const team = roster.teamOf(input.user) ?? roster.smaller();
    const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: letter === question.correct, choice: letter };
    return {
      consumed: true,
      state: { ...state },
      commit: () => {
        roster.join(input.user, input.nickname, team);
        state.book.add(answer);
      }
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const { result, awards, commit } = scoreQuestion(state, config);
      const gain = teamGains(state.roster, awards);
      const question = current(state);
      const letter = LETTERS[question.correct] ?? '';
      const roster = state.roster;
      return {
        consumed: false,
        state: { ...state, stage: 'reveal', last: result, lastGain: gain, teamScores: [state.teamScores[0] + gain[0], state.teamScores[1] + gain[1]] },
        awards,
        commit: () => {
          commit();
          for (const award of awards) roster.contribute(award.user, award.points);
        },
        endsAt: ctx.now + config.reveal * 1000,
        message: t('Đáp án {letter}: {answer} • {red} +{a} · {blue} +{b}', {
          letter,
          answer: question.answers[question.correct] ?? '',
          red: teamName(0),
          blue: teamName(1),
          a: gain[0],
          b: gain[1]
        }),
        effects: [result.correct ? { kind: 'correct', text: `✅ ${letter}` } : { kind: 'wrong', text: t('Đáp án {letter}', { letter }) }]
      };
    }
    if (state.stage !== 'reveal') return null;
    const next = nextQuestion(state, ctx.now, state.items[state.index + 1]?.answers.length);
    return next ? { consumed: false, state: next, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state, config) {
    // Stopped mid-question: the answers so far still count.
    const scored = state.stage === 'ask' ? scoreQuestion(state, config) : null;
    const gain = scored ? teamGains(state.roster, scored.awards) : [0, 0];
    scored?.commit();
    if (scored) for (const award of scored.awards) state.roster.contribute(award.user, award.points);
    const teamScores: [number, number] = [state.teamScores[0] + (gain[0] ?? 0), state.teamScores[1] + (gain[1] ?? 0)];
    const winner = winnerOf(teamScores);
    const awards: PointAward[] = [...(scored?.awards ?? [])];
    if (winner != null && config.teamBonus > 0) {
      for (const [user, member] of state.roster.entries()) {
        if (member.team === winner && member.contribution > 0) awards.push({ user, nickname: member.nickname, points: config.teamBonus });
      }
    }
    const done: TeamQuizRound = { ...state, stage: 'done', teamScores, last: scored?.result ?? state.last };
    return {
      state: done,
      awards,
      message: winner == null
        ? t('🆚 Hòa {a} – {b}!', { a: teamScores[0], b: teamScores[1] })
        : t('🆚 {team} thắng {a} – {b}! Mỗi thành viên có điểm +{bonus}', { team: teamName(winner), a: teamScores[winner], b: teamScores[winner === 0 ? 1 : 0], bonus: config.teamBonus }),
      effects: [winner == null
        ? { kind: 'lose', text: t('🤝 Hòa!') }
        : podiumEffect(state.totals.top(3), t('🏆 {team} thắng!', { team: teamName(winner) }))]
    };
  },

  testActions(state) {
    const joins = [chatTest(t('Vào phe Đỏ'), '!do', 0.5), chatTest(t('Vào phe Xanh'), '!xanh', 0.5)];
    if (state.stage !== 'ask') return joins;
    const question = current(state);
    return [
      ...joins,
      ...question.answers.map((_, index) => chatTest(LETTERS[index] ?? '', LETTERS[index] ?? '')),
      chatTest(t('Trả lời đúng ({letter})', { letter: LETTERS[question.correct] ?? '' }), LETTERS[question.correct] ?? 'A', 1.5)
    ];
  },

  view(state) {
    const teams: [{ label: string; score: number; members: number }, { label: string; score: number; members: number }] = [
      { label: teamName(0), score: state.teamScores[0], members: state.roster.counts[0] },
      { label: teamName(1), score: state.teamScores[1], members: state.roster.counts[1] }
    ];
    if (state.stage === 'done') {
      return view({
        headline: t('🏁 Tổng kết'),
        hint: t('{questions} câu • {players} người có điểm', { questions: state.index + 1, players: count(state.totals.size) }),
        teams,
        rows: rankingRows(state.totals.top(5))
      });
    }
    const question = current(state);
    const revealed = state.stage === 'reveal';
    const { counts, total } = state.book;
    return view({
      style: { rows: 'quiz' },
      headline: question.question,
      hint: revealed
        ? `${progressLabel(state)} • ${resultHint(state.last)} • ${t('{red} +{a} · {blue} +{b}', { red: teamName(0), blue: teamName(1), a: state.lastGain[0], b: state.lastGain[1] })}`
        : `${progressLabel(state)} • ${t('Comment a / b / c / d')} • ${t('{count} người đã trả lời', { count: count(total) })}`,
      teams,
      rows: question.answers.map((answer, index) => ({
        badge: LETTERS[index],
        label: answer,
        value: revealed ? String(counts[index] ?? 0) : undefined,
        percent: revealed ? percentOf(counts[index] ?? 0, total) : undefined,
        highlight: revealed && index === question.correct
      }))
    });
  }
};
