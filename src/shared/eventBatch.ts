import type { LikeLiveEvent, LiveEvent } from './types';

function isLike(event: LiveEvent | undefined): event is LikeLiveEvent {
  return event?.type === 'like' && 'count' in event;
}

/** How often main hands a batch of LIVE events to the renderer. */
export const EVENT_BATCH_MS = 100;
/** Comments per batch the app processes (20,000/s); the rest are counted and skipped. */
export const MAX_CHATS_PER_BATCH = 2000;
/** "Joined the room" events per batch; big rooms produce floods that nobody reads. */
export const MAX_JOINS_PER_BATCH = 20;

export interface LiveEventBatch {
  events: LiveEvent[];
  /** Comments / joins skipped in this batch because of the caps above. */
  dropped: { chat: number; join: number };
}

/**
 * Collects TikTok events between flushes so the renderer runs once per batch
 * instead of once per comment. Under overload it keeps every gift, follow and
 * like (likes are merged per viewer) and samples comments/joins up to the caps,
 * so the app stays responsive in rooms far bigger than it can fully process.
 */
export class LiveEventBatcher {
  private events: LiveEvent[] = [];
  private chats = 0;
  private joins = 0;
  private dropped = { chat: 0, join: 0 };
  /** Index in `events` of each viewer's merged like event in this batch. */
  private likeIndex = new Map<string, number>();

  constructor(private readonly limits = { chats: MAX_CHATS_PER_BATCH, joins: MAX_JOINS_PER_BATCH }) {}

  get size(): number {
    return this.events.length;
  }

  push(event: LiveEvent): void {
    // The app's own test events always go through.
    const simulated = event.simulated === true;
    if (event.type === 'chat' && !simulated) {
      if (this.chats >= this.limits.chats) {
        this.dropped.chat += 1;
        return;
      }
      this.chats += 1;
    } else if (event.type === 'join' && !simulated) {
      if (this.joins >= this.limits.joins) {
        this.dropped.join += 1;
        return;
      }
      this.joins += 1;
    } else if (isLike(event) && !simulated) {
      const index = this.likeIndex.get(event.user);
      const merged = index != null ? this.events[index] : undefined;
      if (index != null && isLike(merged)) {
        this.events[index] = { ...merged, count: merged.count + event.count, total: Math.max(merged.total, event.total) };
        return;
      }
      this.likeIndex.set(event.user, this.events.length);
    }
    this.events.push(event);
  }

  /** Returns the batch collected so far (null when empty) and starts a new one. */
  flush(): LiveEventBatch | null {
    if (!this.events.length && !this.dropped.chat && !this.dropped.join) return null;
    const batch: LiveEventBatch = { events: this.events, dropped: this.dropped };
    this.events = [];
    this.chats = 0;
    this.joins = 0;
    this.dropped = { chat: 0, join: 0 };
    this.likeIndex = new Map();
    return batch;
  }
}
