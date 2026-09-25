import { foldText } from './text';

/**
 * Red / Blue team games (Thành trì, Quiz đối kháng). Members live in a mutable
 * map written only from `HandleResult.commit`, so a join doesn't copy the whole
 * team (big rooms have thousands of members).
 */
export type Team = 0 | 1;

export interface Member {
  nickname: string;
  team: Team;
  /** Damage dealt, points scored… whatever the game counts. */
  contribution: number;
}

export class TeamRoster {
  private members = new Map<string, Member>();
  readonly counts: [number, number] = [0, 0];

  get size(): number {
    return this.members.size;
  }

  teamOf(user: string): Team | null {
    return this.members.get(user)?.team ?? null;
  }

  /** Where a viewer who doesn't pick goes: the smaller team (Red on a tie). */
  smaller(): Team {
    return this.counts[0] <= this.counts[1] ? 0 : 1;
  }

  /** Joins once; the team can't be changed afterwards (no switching to the winning side). */
  join(user: string, nickname: string, team: Team): void {
    if (this.members.has(user)) return;
    this.members.set(user, { nickname, team, contribution: 0 });
    this.counts[team] += 1;
  }

  contribute(user: string, amount: number): void {
    const member = this.members.get(user);
    if (member) member.contribution += amount;
  }

  *entries(): Generator<[string, Member]> {
    yield* this.members.entries();
  }

  /** Biggest contributor of a team (O(n); for the end of a round). */
  best(team: Team): { user: string; nickname: string; contribution: number } | null {
    let best: { user: string; nickname: string; contribution: number } | null = null;
    for (const [user, member] of this.members) {
      if (member.team === team && member.contribution > 0 && (!best || member.contribution > best.contribution)) {
        best = { user, nickname: member.nickname, contribution: member.contribution };
      }
    }
    return best;
  }
}

/**
 * Team picked by a comment: "!do" / "!đỏ" / "!red" → Red, "!xanh" / "!blue" → Blue,
 * "!join" → the smaller team ("auto"). Without "!" only the whole words "đỏ",
 * "xanh", "red", "blue" count (so an everyday "do" / "đó" in chat doesn't).
 */
export function teamChoice(text: string): Team | 'auto' | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('!')) {
    const [head = '', ...rest] = trimmed.slice(1).split(/\s+/);
    if (rest.length) return null;
    const word = foldText(head);
    if (word === 'do' || word === 'red') return 0;
    if (word === 'xanh' || word === 'blue') return 1;
    return word === 'join' ? 'auto' : null;
  }
  const word = trimmed.toLowerCase();
  if (word === 'đỏ' || word === 'red') return 0;
  if (word === 'xanh' || word === 'blue') return 1;
  return null;
}

/** "!ban", "!bắn", "!BAN" — one of `names` (folded), with "!" and nothing after it. */
export function isBangCommand(text: string, names: string[]): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!') || /\s/.test(trimmed)) return false;
  return names.includes(foldText(trimmed.slice(1)));
}
