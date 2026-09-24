import type { AnyGame } from './registry';

/**
 * Global chat commands (whitelist). Game-specific commands such as `!join`
 * are handled by each game module instead.
 */
export type GlobalCommand =
  | { kind: 'help' }
  | { kind: 'rank' }
  | { kind: 'games' }
  | { kind: 'start'; game: AnyGame | null; unknown: string | null }
  | { kind: 'stop' }
  | { kind: 'cancel' };

const NAMES: Record<GlobalCommand['kind'], string[]> = {
  help: ['help', 'huongdan', 'cachchoi'],
  rank: ['rank', 'diem', 'point', 'points'],
  games: ['games', 'listgame'],
  start: ['start', 'batdau'],
  stop: ['stop', 'chot'],
  cancel: ['cancel', 'huy']
};

/** Commands only the streamer or a moderator may use. */
export const HOST_ONLY: ReadonlySet<GlobalCommand['kind']> = new Set(['games', 'start', 'stop', 'cancel']);

export const GLOBAL_COMMAND_HELP = [
  { usage: '!help', description: 'Xem cách chơi game đang chạy', host: false },
  { usage: '!rank', description: 'Xem điểm và hạng của mình', host: false },
  { usage: '!doigame', description: 'Bỏ phiếu đổi game (streamer/mod: đổi ngay)', host: false },
  { usage: '!start', description: 'Bắt đầu game đang chọn', host: true },
  { usage: '!start quiz', description: 'Chọn và bắt đầu game theo tên', host: true },
  { usage: '!stop', description: 'Chốt kết quả vòng đang chạy', host: true },
  { usage: '!cancel', description: 'Huỷ vòng đang chạy', host: true },
  { usage: '!games', description: 'Hiện danh sách tên game cho !start', host: true }
];

function simplify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}

/** Game names accepted by `!start <name>`: the id plus its aliases. */
export function gameNames(game: AnyGame): string[] {
  return [simplify(game.id), ...(game.aliases ?? []).map(simplify)];
}

export function resolveGame(name: string, games: AnyGame[]): AnyGame | null {
  const wanted = simplify(name);
  return wanted ? games.find((game) => gameNames(game).includes(wanted)) ?? null : null;
}

export function parseGlobalCommand(text: string, games: AnyGame[]): GlobalCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!') || trimmed.length > 60) return null;
  const [head = '', ...rest] = trimmed.slice(1).split(/\s+/);
  const name = head.toLowerCase();
  const kind = (Object.keys(NAMES) as GlobalCommand['kind'][]).find((key) => NAMES[key].includes(name));
  if (!kind) return null;
  if (kind === 'start') {
    const arg = rest.join(' ');
    if (!arg) return { kind, game: null, unknown: null };
    const game = resolveGame(arg, games);
    return { kind, game, unknown: game ? null : arg.slice(0, 30) };
  }
  return { kind } as GlobalCommand;
}

/** Parses "user1, @user2 user3" into a lowercase username set. */
export function parseModerators(text: string): Set<string> {
  return new Set(
    text
      .split(/[\s,;]+/)
      .map((name) => name.trim().replace(/^@/, '').toLowerCase())
      .filter((name) => /^[a-z0-9._]{1,40}$/.test(name))
  );
}
