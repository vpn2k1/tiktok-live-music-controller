/** English entries (Vietnamese source text → English). See ../i18n.ts. */
export const EN_CORE: Record<string, string> = {
  // types.ts: categories and test buttons
  'Giải trí': 'Fun',
  'Tiếng Anh 🇬🇧': 'English 🇬🇧',
  'Tiếng Nhật 🇯🇵': 'Japanese 🇯🇵',
  'Tiếng Trung 🇨🇳': 'Chinese 🇨🇳',
  '+{count} tim': '+{count} likes',
  '+{0} tim': '+{0} likes',

  // autoplay.ts: default group names (stored in Vietnamese, translated for display)
  'Giải trí 🎉': 'Fun 🎉',
  'Tất cả game': 'All games',
  'Nhóm của tôi': 'My group',
  'Nhóm {n}': 'Group {n}',
  'Nhóm {0}': 'Group {0}',
  'Nhóm không tên': 'Unnamed group',

  // useAutoPlay.ts
  'LIVE thêm {minutes} phút': 'LIVE extended by {minutes} min',
  'Đã tắt tự động': 'Auto turned off',
  '🎮 Chơi {title}!': '🎮 Let’s play {title}!',
  'Không game nào trong danh sách bắt đầu được': 'None of the games in the list could start',
  'Không game nào trong danh sách bắt đầu được: đã tắt tự động': 'None of the games in the list could start: auto turned off',
  'Tự động: LIVE {liveMinutes} phút': 'Auto: {liveMinutes} min LIVE',
  'Tự động: bật': 'Auto: on',
  '⏰ Hết giờ LIVE — cảm ơn mọi người đã chơi!': '⏰ LIVE’s over — thanks for playing!',
  'Hết giờ LIVE: đã tắt tự động': 'LIVE time is up: auto turned off',
  'Hết ván này sẽ đổi game.': 'New game when this round ends.',
  '🔄 Streamer đổi game!': '🔄 The host is switching the game!',

  // lobby.ts: closing the vote
  '🎲 Không ai chọn — bốc ngẫu nhiên: {title}!': '🎲 Nobody voted — random pick: {title}!',
  '🎲 Hoà phiếu ({count} game) — bốc ngẫu nhiên: {title}!': '🎲 Tied vote ({count} games) — random pick: {title}!',
  '✅ Nhiều phiếu nhất: {title}!': '✅ Most votes: {title}!',
  '▶ {title} bắt đầu ngay sau đây!': '▶ {title} starts in a moment!',

  // series.ts + overlay: end-of-round celebration
  '🏁 Tổng kết {asked} câu': '🏁 Final after {asked} questions',
  '🎉 Chúc mừng! 🎉': '🎉 Congratulations! 🎉',
  '🏆 Chúc mừng top {n}!': '🏆 Congrats, top {n}!',
  '🔑 Từ khóa: {keyword}': '🔑 Keyword: {keyword}',
  '{n} điểm công/thủ': '{n} attack/defence pts',
  '{n} trận thắng': '{n} wins',
  '🤠 Tay súng nhanh nhất': '🤠 Fastest guns',
  '👑 Giữ ngai lâu nhất': '👑 Longest reigns',
  '🃏 Trí nhớ siêu đỉnh': '🃏 Memory masters',
  '⚔️ {damage} sát thương': '⚔️ {damage} damage',
  '⏰ Còn 5 phút nữa là hết LIVE!': '⏰ 5 minutes of LIVE left!',
  '🔄 Đổi game: {title}': '🔄 Next game: {title}',
  '🔄 {nickname} đổi game!': '🔄 {nickname} switched the game!',
  '🔄 {needed} người muốn đổi game!': '🔄 {needed} viewers want a new game!',
  '🔄 {nickname} muốn đổi game ({count}/{needed}) · gõ !doigame': '🔄 {nickname} wants a new game ({count}/{needed}) · type !doigame',
  '🎁 {nickname} tặng {gift}: đổi game!': '🎁 {nickname} sent {gift}: new game!',

  // useLiveGames.ts
  'Kết quả {title}': '{title} result',
  'Đang có game chạy, hãy Chốt hoặc Huỷ trước.': 'A game is running; end or cancel it first.',
  'Bắt đầu: {title}': 'Started: {title}',
  'Đã huỷ vòng chơi': 'Round cancelled',
  'Chưa có game. Lệnh: !help, !rank': 'No game yet. Commands: !help, !rank',
  '{nickname}: {points} điểm, hạng #{rank}/{size}': '{nickname}: {points} pts, rank #{rank}/{size}',
  '{nickname}: chưa có điểm, chơi game để lên bảng nhé!': '{nickname}: no points yet, play to get on the board!',
  'Không có game “{name}”. Gõ !games để xem tên.': 'No game “{name}”. Type !games to see the names.',
  'Từ điển quá lớn để lưu lại; chỉ dùng trong phiên này.': 'Dictionary too large to save; it’s only used this session.',

  // lobby.ts (overlay game list)
  '🎮 Chọn game · {group}': '🎮 Pick a game · {group}',
  '🎮 Chọn game': '🎮 Pick a game',
  'Gõ 1–{count} để chọn game!': 'Type 1–{count} to pick a game!',
  'Có phiếu đầu tiên là bắt đầu đếm ngược': 'Countdown starts at the first vote',
  'Game nhiều phiếu nhất sẽ được chơi': 'The game with the most votes gets played',
  'Gõ 1–{count} · chọn game': 'Type 1–{count} · pick a game',
  'Tặng quà · +{votes} phiếu / quà': 'Send a gift · +{votes} votes / gift',

  // series.ts (shared by question games)
  'Số câu mỗi lượt': 'Questions per round',
  'Giây mỗi câu': 'Seconds per question',
  'Điểm tối đa mỗi câu': 'Max points per question',
  'Trả lời ngay = điểm tối đa, sát hết giờ = một nửa.': 'Instant answer = max points, at the buzzer = half.',
  'Giây xem đáp án': 'Seconds to show the answer',
  'Thứ tự câu hỏi': 'Question order',
  'Ngẫu nhiên (không lặp đến khi hết)': 'Random (no repeats until all are used)',
  'Đúng thứ tự trong ngân hàng / file': 'Same order as the bank / file',
  'Hết lượt': 'Round over',
  'Câu {n}/{total}': 'Q {n}/{total}',
  'Chưa ai đúng ({total} người trả lời)': 'Nobody got it ({total} answered)',
  'Chưa ai trả lời': 'No answers yet',
  '⚡ {nickname} {time} • {correct}/{total} người đúng': '⚡ {nickname} {time} • {correct}/{total} correct',
  '{points}đ': '{points} pts',
  '🏁 Hết {asked} câu. Chưa ai ghi điểm.': '🏁 {asked} questions done. Nobody scored.',
  '🏁 Tổng kết {asked} câu: {ranking}': '🏁 After {asked} questions: {ranking}',

  // chatCommands.ts (GLOBAL_COMMAND_HELP descriptions)
  'Xem cách chơi game đang chạy': 'How to play the current game',
  'Xem điểm và hạng của mình': 'Your points and rank',
  'Bỏ phiếu đổi game (streamer/mod: đổi ngay)': 'Vote to switch game (host/mod: switch now)',
  'Bắt đầu game đang chọn': 'Start the selected game',
  'Chọn và bắt đầu game theo tên': 'Pick and start a game by name',
  'Chốt kết quả vòng đang chạy': 'End and score the current round',
  'Huỷ vòng đang chạy': 'Cancel the current round',
  'Hiện danh sách tên game cho !start': 'List the game names for !start',
  'Đối kháng ⚔️': 'Versus ⚔️'
};
