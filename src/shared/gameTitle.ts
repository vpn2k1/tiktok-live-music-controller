/** Trailing emoji / flags of a title ("Quiz A/B/C/D ❓" → "❓"), used as the game's icon. */
const TITLE_ICON = /\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\p{Extended_Pictographic}\p{Regional_Indicator}‍️⃣→]*)$/u;

/** Splits a game title into its name and icon (🎮 when the title has none). */
export function splitTitle(title: string): { name: string; icon: string } {
  const match = TITLE_ICON.exec(title);
  return match ? { name: title.slice(0, match.index).trim(), icon: match[1] ?? '' } : { name: title, icon: '🎮' };
}
