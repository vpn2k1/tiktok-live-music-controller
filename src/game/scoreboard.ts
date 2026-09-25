import type { ScoreEntry } from '../shared/types';

/** Leaderboard rows kept ready for the overlay; the overlay shows ≤ 10. */
const TOP_SIZE = 20;
/** Initial rank index size; grows by doubling up to MAX_INDEXED_POINTS. */
const INITIAL_POINT_RANGE = 1 << 16;
/** Scores above this share the top rank bucket (still ranked exactly by the top list). */
const MAX_INDEXED_POINTS = 1 << 24;

/**
 * Counts viewers per score with a Fenwick tree, so "how many have more points
 * than p" is O(log P) no matter how many viewers there are.
 */
class ScoreIndex {
  private tree = new Int32Array(INITIAL_POINT_RANGE + 1);
  private total = 0;
  /** Viewers per distinct score, to rebuild the tree when it grows. */
  private counts = new Map<number, number>();

  private capacity(): number {
    return this.tree.length - 1;
  }

  private ensure(points: number): void {
    if (points <= this.capacity() || this.capacity() >= MAX_INDEXED_POINTS) return;
    let size = this.capacity();
    while (size < points && size < MAX_INDEXED_POINTS) size *= 2;
    this.tree = new Int32Array(size + 1);
    for (const [p, count] of this.counts) this.add(p, count);
  }

  private clamp(points: number): number {
    return Math.max(0, Math.min(MAX_INDEXED_POINTS - 1, Math.floor(points)));
  }

  /** Viewers with a score ≤ points. */
  private prefix(points: number): number {
    let sum = 0;
    for (let i = Math.min(points + 1, this.capacity()); i > 0; i -= i & -i) sum += this.tree[i] ?? 0;
    return sum;
  }

  private add(points: number, delta: number): void {
    for (let i = points + 1; i <= this.capacity(); i += i & -i) this.tree[i] = (this.tree[i] ?? 0) + delta;
  }

  private update(points: number, delta: number): void {
    this.total += delta;
    const count = (this.counts.get(points) ?? 0) + delta;
    if (count) this.counts.set(points, count);
    else this.counts.delete(points);
    this.add(points, delta);
  }

  move(from: number | null, to: number): void {
    const target = this.clamp(to);
    this.ensure(target + 1);
    if (from != null) this.update(this.clamp(from), -1);
    this.update(target, 1);
  }

  /** Viewers with strictly more points. */
  above(points: number): number {
    return this.total - this.prefix(this.clamp(points));
  }
}

/**
 * Session leaderboard sized for very large rooms: adding points is O(log P),
 * the top list is kept incrementally (points only ever go up) and a viewer's
 * rank is O(log P). It is mutable on purpose: copying a million-entry object
 * on every award is what makes naive leaderboards freeze.
 */
export class Scoreboard {
  private entries = new Map<string, ScoreEntry>();
  private index = new ScoreIndex();
  private topList: ScoreEntry[] = [];

  get size(): number {
    return this.entries.size;
  }

  get(user: string): ScoreEntry | undefined {
    return this.entries.get(user);
  }

  add(user: string, nickname: string, points: number): void {
    if (!user || !(points > 0)) return;
    const old = this.entries.get(user);
    const entry: ScoreEntry = { user, nickname: nickname || old?.nickname || user, points: (old?.points ?? 0) + points };
    this.entries.set(user, entry);
    this.index.move(old ? old.points : null, entry.points);
    this.updateTop(entry);
  }

  private updateTop(entry: ScoreEntry): void {
    const list = this.topList.filter((item) => item.user !== entry.user);
    const last = list[list.length - 1];
    if (list.length < TOP_SIZE || !last || compare(entry, last) < 0) {
      list.push(entry);
      list.sort(compare);
      if (list.length > TOP_SIZE) list.length = TOP_SIZE;
    }
    this.topList = list;
  }

  /** Best `limit` viewers (≤ 20), highest first. */
  top(limit = 5): ScoreEntry[] {
    return this.topList.slice(0, Math.min(limit, TOP_SIZE));
  }

  /** 1-based rank, or null for a viewer without points. Ties share a rank. */
  rank(user: string): number | null {
    const entry = this.entries.get(user);
    return entry ? this.index.above(entry.points) + 1 : null;
  }
}

function compare(a: ScoreEntry, b: ScoreEntry): number {
  return b.points - a.points || (a.user < b.user ? -1 : a.user > b.user ? 1 : 0);
}
