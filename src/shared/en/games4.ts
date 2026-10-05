/** English entries (Vietnamese source text → English). See ../i18n.ts. */

/** Vocabulary set names (VpngoPlay sets, src/game/vocab.ts), with sample numbers. */
const SET_NAMES: [string, string][] = [
  ['Trẻ em (con vật, gia đình, đồ ăn…)', 'Kids (animals, family, food…)'],
  ['Luyện thi IELTS', 'IELTS prep'],
  ['Luyện thi JLPT N5–N3', 'JLPT N5–N3 prep'],
  ['Luyện thi HSK 1–4', 'HSK 1–4 prep'],
  ['Công sở', 'At work'],
  ['Thành ngữ', 'Idioms'],
  ['Thành ngữ, tục ngữ', 'Idioms & proverbs'],
  ['Thành ngữ 成语', 'Chengyu 成语'],
  ['Cơ bản 1 (từ 1–500)', 'Basic 1 (words 1–500)']
];
/** How a set name appears: game settings add a word / question count or a quiz kind. */
const SET_SUFFIXES: [string, string][] = [
  ['', ''],
  [' · 72 từ', ' · 72 words'],
  [' · 72 câu', ' · 72 questions'],
  [' — đoán nghĩa', ' — guess the meaning']
];

const NUMBER = /\d+(?:[.,]\d+)*/g;
const HAS_NUMBER = /\d/;

/** "Cơ bản 1 (từ 1–500)" → "Cơ bản {0} (từ {1}–{2})" (the numbers match any set). */
function template(text: string): string {
  let index = 0;
  return text.replace(NUMBER, () => `{${index++}}`);
}

function setEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const flag of ['🇬🇧', '🇯🇵', '🇨🇳']) {
    for (const [vi, en] of SET_NAMES) {
      for (const [viSuffix, enSuffix] of SET_SUFFIXES) {
        const key = `${flag} ${vi}${viSuffix}`;
        const value = `${flag} ${en}${enSuffix}`;
        // Without numbers the exact text is the key; with numbers, the {0} template.
        entries[HAS_NUMBER.test(key) ? template(key) : key] = HAS_NUMBER.test(value) ? template(value) : value;
      }
    }
  }
  return entries;
}

export const EN_GAMES4: Record<string, string> = {
  ...setEntries(),

  // Shared vocabulary settings (src/game/vocab.ts)
  'Bộ từ có sẵn': 'Built-in word set',
  'Từ vựng riêng (tuỳ chọn)': 'Your own words (optional)',
  'Để trống = dùng bộ có sẵn. Ngôn ngữ theo bộ có sẵn đang chọn. Tiếng Anh: từ | nghĩa; tiếng Nhật: 語 | kana/romaji | nghĩa; tiếng Trung: 汉字 | pinyin | nghĩa. Nhập được file .txt / .csv.':
    'Empty = use the built-in set. The language follows the selected set. English: word | Vietnamese meaning; Japanese: 語 | kana/romaji | meaning; Chinese: 汉字 | pinyin | meaning. .txt / .csv files can be imported.',
  'Từ vựng cơ bản của app · {0} câu': "App's basic vocabulary · {0} questions",
  'Từ vựng cơ bản của app': "App's basic vocabulary",
  'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Empty = use the built-in set above. Each line: english[/other word] | Vietnamese meaning. .txt / .csv files (Excel, Google Sheets) can be imported.',
  'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng: chữ Nhật | cách đọc/romaji[/cách khác] | nghĩa tiếng Việt. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Empty = use the built-in set above. Each line: Japanese | reading/romaji[/other] | Vietnamese meaning. .txt / .csv files (Excel, Google Sheets) can be imported.',
  'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng: chữ Hán | pinyin[/cách khác] | nghĩa tiếng Việt. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Empty = use the built-in set above. Each line: characters | pinyin[/other] | Vietnamese meaning. .txt / .csv files (Excel, Google Sheets) can be imported.',
  'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng: chữ Hán | pinyin | nghĩa tiếng Việt. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Empty = use the built-in set above. Each line: characters | pinyin | Vietnamese meaning. .txt / .csv files (Excel, Google Sheets) can be imported.',
  'tiếng Nhật': 'Japanese',
  'tiếng Trung': 'Chinese',
  '{count} từ': '{count} words',
  'Không có từ hợp lệ.': 'No valid words.',
  '🏁 Hết lượt, chưa ai ghi điểm.': '🏁 Round over, nobody scored.',

  // Ai là triệu phú (millionaire.ts)
  'Ai là triệu phú 💰': 'Who Wants to Be a Millionaire 💰',
  'Cả phòng là người chơi: mỗi câu comment a, b, c hoặc d. Đáp án nhiều phiếu nhất là câu trả lời của cả phòng — đúng thì leo lên bậc ⭐ tiếp theo (15 bậc), sai thì dừng ở mốc an toàn (câu 5, câu 10). Ai bình chọn đúng đều được điểm, càng nhanh càng nhiều. Quà mở quyền trợ giúp 50:50 rồi Hỏi khán giả.':
    'The whole room is the contestant: comment a, b, c or d each question. The most-voted option is the room\'s answer — right climbs to the next ⭐ step (15 steps), wrong stops at the safe step (question 5, question 10). Everyone who voted right scores, faster = more. Gifts unlock the 50:50 lifeline, then Ask the audience.',
  'Bình chọn đáp án (chỉ tính lần đầu)': 'Vote for an answer (first vote counts)',
  'Tặng quà': 'Send a gift',
  'Mở trợ giúp: lần 1 = 50:50, lần 2 = Hỏi ý kiến khán giả': 'Unlock a lifeline: 1st = 50:50, 2nd = Ask the audience',
  '!5050 / !khangia / !doicau': '!5050 / !khangia / !doicau',
  'Streamer dùng trợ giúp: 50:50, hỏi khán giả, đổi câu hỏi': 'Host uses a lifeline: 50:50, ask the audience, switch the question',
  'Streamer dừng cuộc chơi, giữ số ⭐ đang có': 'Host stops the game and keeps the ⭐ reached',
  'Quà mở quyền trợ giúp': 'Gifts unlock lifelines',
  'Có (quà đầu = 50:50, quà sau = Hỏi khán giả)': 'Yes (first gift = 50:50, next = Ask the audience)',
  'Không, chỉ streamer dùng lệnh': 'No, host commands only',
  'Để trống = dùng bộ có sẵn. Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). Cần đủ 16 câu cho 15 bậc + 1 câu đổi. Nhập được file .txt / .csv.':
    'Empty = use the built-in set. Each line: Question | A | B | C | D | Correct answer (letter A–D or the answer text). 16 questions cover the 15 steps + 1 switch. .txt / .csv files can be imported.',
  '“{word}” nghĩa là gì?': 'What does “{word}” mean?',
  '🛟 50:50 — bỏ 2 phương án sai': '🛟 50:50 — two wrong options removed',
  '👥 Hỏi ý kiến khán giả — hiện tỉ lệ bình chọn': '👥 Ask the audience — vote shares shown',
  '🔄 Đổi câu hỏi': '🔄 Question switched',
  '✋ Dừng cuộc chơi': '✋ Game stopped',
  '✅ Đúng! {stars}': '✅ Correct! {stars}',
  '⏰ Hết giờ!': "⏰ Time's up!",
  '❌ Sai! Đáp án {letter}': '❌ Wrong! The answer is {letter}',
  'Cả phòng chọn {letter} — chính xác! Lên bậc {step}: {stars}': 'The room chose {letter} — correct! Step {step}: {stars}',
  'Không ai bình chọn — đáp án {letter}: {answer}': 'Nobody voted — the answer is {letter}: {answer}',
  'Cả phòng chọn {choice} — sai rồi! Đáp án {letter}: {answer}': 'The room chose {choice} — wrong! The answer is {letter}: {answer}',
  '💰 Cả phòng là TRIỆU PHÚ! {stars}': '💰 The room is a MILLIONAIRE! {stars}',
  '💰 Cả phòng ra về với {stars} (bậc {step}/15)': '💰 The room leaves with {stars} (step {step}/15)',
  'Trả lời sai ({letter})': 'Wrong answer ({letter})',
  'Quà (trợ giúp)': 'Gift (lifeline)',
  '💰 TRIỆU PHÚ!': '💰 MILLIONAIRE!',
  '💰 {stars}': '💰 {stars}',
  'Cả phòng leo được {step}/15 bậc': 'The room climbed {step}/15 steps',
  'Câu {n} • {stars}': 'Question {n} • {stars}',
  '{count} phiếu': '{count} votes',
  'Mốc an toàn {stars}': 'Safe step {stars}',
  'Trợ giúp: {list}': 'Lifelines: {list}',

  // Lô tô (bingo.ts)
  'Lô tô 🎟️': 'Bingo 🎟️',
  'Cả phòng chung một tấm vé ghi nghĩa tiếng Việt, mỗi ô một số. Người xướng đọc một từ tiếng Anh / Nhật / Trung: comment số ô có nghĩa đúng (mỗi người một lần mỗi lượt đọc). Ai đúng trước giành ô; giành ô cuối của một hàng ngang, dọc hay chéo là "Kinh!" được thưởng thêm.':
    'The room shares one ticket of numbered Vietnamese meanings. The caller reads an English / Japanese / Chinese word: comment the number of its meaning (one try per call). The first right number claims the square; claiming the last square of a row, column or diagonal is "Bingo!" with a bonus.',
  'Gõ số ô có nghĩa của từ vừa đọc': 'Type the number of the square with the called word\'s meaning',
  'Cỡ vé (số ô mỗi cạnh)': 'Ticket size (squares per side)',
  'Giây mỗi lượt đọc': 'Seconds per call',
  'Điểm mỗi ô': 'Points per square',
  'Điểm thưởng "Kinh!"': '"Bingo!" bonus points',
  'Cần ít nhất {n} từ có nghĩa khác nhau cho vé {size}×{size}.': 'A {size}×{size} ticket needs at least {n} words with different meanings.',
  '🎉 KINH! {name} +{points}': '🎉 BINGO! {name} +{points}',
  '🎉 KINH! {name} hoàn thành {n} hàng': '🎉 BINGO! {name} completed {n} line(s)',
  'Không ai giành ô {n}: {word} = {meaning}': 'Nobody claimed square {n}: {word} = {meaning}',
  '🎟️ Hết vé: {claimed}/{total} ô có chủ, {lines} lần Kinh.': '🎟️ Ticket done: {claimed}/{total} squares claimed, {lines} bingo(s).',
  '🎟️ Vua lô tô!': '🎟️ Bingo champion!',
  'Hết vé': 'Ticket done',
  'Số sai: {n}': 'Wrong number: {n}',
  'Số đúng: {n}': 'Right number: {n}',
  '{n} lần Kinh': '{n} bingo(s)',
  'Lượt đọc {n}/{total}': 'Call {n}/{total}',
  'Comment số ô có nghĩa đúng': 'Comment the number of the right meaning',
  '✅ {name} giành ô {n}': '✅ {name} claimed square {n}',
  'Đáp án: ô {n}': 'Answer: square {n}',

  // Cờ caro Đỏ – Xanh (teamCaro.ts)
  'Cờ caro Đỏ – Xanh ⭕': 'Red vs Blue Tic-tac-toe ⭕',
  'Bàn cờ có các ô ghi nghĩa tiếng Việt. Vào phe Đỏ hoặc Xanh, rồi comment từ tiếng Anh / Nhật / Trung của một ô để chiếm ô đó cho phe mình. Phe nào có 3 ô thẳng hàng (ngang, dọc, chéo) thắng ván; thắng đủ số ván trước là thắng trận.':
    'The board\'s squares show Vietnamese meanings. Join Red or Blue, then comment the English / Japanese / Chinese word of a square to claim it for your side. Three in a row (across, down, diagonal) wins the board; the first side to win enough boards wins the match.',
  'cat / ねこ / māo': 'cat / ねこ / māo',
  'Gõ từ của một ô để chiếm ô cho phe mình': 'Type a square\'s word to claim it for your side',
  'Cỡ bàn cờ (ô mỗi cạnh)': 'Board size (squares per side)',
  'Luôn cần 3 ô thẳng hàng để thắng ván; bàn to hơn thì khó chặn hơn.': 'Three in a row always wins a board; bigger boards are harder to block.',
  'Số ván thắng để thắng trận': 'Boards to win the match',
  'Giây mỗi ván': 'Seconds per board',
  'Hết giờ mà chưa ai có 3 ô thẳng hàng: phe nhiều ô hơn thắng ván.': 'When time runs out without three in a row, the side with more squares wins the board.',
  'Giây xem kết quả ván': 'Seconds to show the board result',
  'Điểm mỗi ô chiếm được': 'Points per claimed square',
  'Điểm thưởng thắng ván (mỗi người góp ô)': 'Board win bonus (each player who claimed a square)',
  'Cần ít nhất {n} từ có nghĩa khác nhau.': 'At least {n} words with different meanings are needed.',
  '⭕ Ván {n} bắt đầu!': '⭕ Board {n} begins!',
  '⭕ Hòa {red} – {blue}!': '⭕ Draw {red} – {blue}!',
  '{n} ô': '{n} squares',
  '🏆 {team} thắng {red} – {blue}!': '🏆 {team} wins {red} – {blue}!',
  'Chiếm ô: {word}': 'Claim: {word}',
  '⭕ Ván {n} • 🔴 {red} – {blue} 🔵': '⭕ Board {n} • 🔴 {red} – {blue} 🔵',
  'Gõ từ {lang} của một ô để chiếm ô • 3 ô thẳng hàng thắng ván • !do / !xanh để vào phe': 'Type a square\'s {lang} word to claim it • 3 in a row wins the board • !do / !xanh to join',
  '⭕ Ván {n} hòa': '⭕ Board {n} is a draw',
  '⭕ {team} có 3 ô thẳng hàng, thắng ván {n}!': '⭕ {team} has three in a row and wins board {n}!',
  '⭕ {team} nhiều ô hơn, thắng ván {n}!': '⭕ {team} has more squares and wins board {n}!',

  // Đoán chữ (wordle.ts)
  'Đoán chữ 🟩': 'Wordle 🟩',
  'Cả phòng cùng đoán một từ tiếng Anh bí mật: comment một từ đúng số chữ cái. Ô xanh = đúng chữ đúng chỗ, ô vàng = có chữ đó nhưng sai chỗ, ô xám = không có. Ai đoán trúng trước được điểm; đoán ra thêm chữ xanh mới cũng có thưởng.':
    'The whole room guesses a secret English word: comment a word with the right number of letters. Green = right letter, right place; yellow = in the word, wrong place; grey = not in it. The first exact guess scores; turning a new letter green earns a bonus too.',
  'Đoán một từ đúng số chữ cái (mỗi từ chỉ tính lần đầu)': 'Guess a word with the right number of letters (each word counts once)',
  'Từ {0} chữ cái (như Wordle) · {1} từ': '{0}-letter words (like Wordle) · {1} words',
  'Từ {0} chữ cái (dễ) · {1} từ': '{0}-letter words (easy) · {1} words',
  'Từ {0} chữ cái (khó) · {1} từ': '{0}-letter words (hard) · {1} words',
  'Số lần đoán tối đa mỗi từ (cả phòng)': 'Max guesses per word (whole room)',
  'Hiện nghĩa tiếng Việt sau số lần đoán': 'Show the Vietnamese meaning after this many guesses',
  '0 = hiện nghĩa ngay từ đầu (dễ hơn).': '0 = show the meaning from the start (easier).',
  'Điểm đoán trúng': 'Points for the right guess',
  'Trúng ngay lần đầu = đủ điểm, càng nhiều lần đoán càng ít (tối thiểu một nửa).': 'Right on the first guess = full points, fewer as guesses add up (at least half).',
  'Điểm mỗi chữ xanh mới': 'Points per new green letter',
  'Từ được đoán': 'Accepted guesses',
  'Mọi chuỗi chữ cái có nguyên âm (dễ)': 'Any letters with a vowel (easy)',
  'Chỉ từ có trong từ điển / bộ từ': 'Only words in the dictionary / word set',
  'Từ bí mật riêng (tuỳ chọn)': 'Your own secret words (optional)',
  'Để trống = dùng bộ có sẵn. Mỗi dòng: từ tiếng Anh (3–8 chữ cái) | nghĩa tiếng Việt. Nhập được file .txt / .csv.':
    'Empty = use the built-in set. Each line: English word (3–8 letters) | Vietnamese meaning. .txt / .csv files can be imported.',
  '🟩 {name} đoán trúng {word}!': '🟩 {name} guessed {word}!',
  '🟩 {name} đoán trúng “{word}” ({meaning}) +{points}': '🟩 {name} guessed “{word}” ({meaning}) +{points}',
  'Từ bí mật là “{word}” ({meaning})': 'The secret word was “{word}” ({meaning})',
  '🏁 Đoán chữ: {ranking}': '🏁 Wordle: {ranking}',
  '🟩 Vua đoán chữ!': '🟩 Wordle champion!',
  'Đoán sai: {word}': 'Wrong guess: {word}',
  'Đoán ngẫu nhiên': 'Random guess',
  'Đoán trúng: {word}': 'Right guess: {word}',
  '🟩 {name} đoán trúng (+{points})': '🟩 {name} got it (+{points})',
  'Không ai đoán ra': 'Nobody got it',
  '🟩 Từ {letters} chữ cái': '🟩 {letters}-letter word',
  'Từ {n}/{total} • Đã đoán {used}/{max}': 'Word {n}/{total} • Guesses {used}/{max}',
  'Nghĩa hiện sau {n} lần đoán': 'Meaning shown after {n} guesses',
  'Loại: {letters}': 'Not in the word: {letters}',

  // Vòng chữ (wordWheel.ts)
  'Vòng chữ 🎡': 'Word Wheel 🎡',
  'Màn hình hiện vài chữ cái và các ô trống cho những từ tiếng Anh ghép được từ chúng (gợi ý là nghĩa tiếng Việt). Comment một từ ghép từ các chữ đó (mỗi chữ dùng một lần): từ trong ô trống được điểm theo số chữ cái, từ có nghĩa khác là từ thưởng.':
    'The screen shows a few letters and blank slots for English words made from them (clues = Vietnamese meanings). Comment a word made of those letters (each used once): a word in the slots scores per letter, any other real word is a bonus word.',
  'Gõ một từ ghép từ các chữ trên vòng': 'Type a word made from the wheel\'s letters',
  'Số vòng mỗi lượt': 'Wheels per round',
  'Số chữ cái trên vòng': 'Letters on the wheel',
  'Bộ từ lớn (Cơ bản) cho nhiều vòng hơn; bộ nhỏ nên chọn 4–5 chữ.': 'Big sets (Basic) make more wheels; small sets work best with 4–5 letters.',
  'Giây mỗi vòng': 'Seconds per wheel',
  'Điểm mỗi chữ cái': 'Points per letter',
  'Điểm từ thưởng': 'Bonus word points',
  'Bộ từ không đủ để tạo vòng {n} chữ cái — thử bộ lớn hơn hoặc ít chữ cái hơn.': 'The word set can\'t make a {n}-letter wheel — try a bigger set or fewer letters.',
  '⭐ Từ thưởng {word}': '⭐ Bonus word {word}',
  '🎡 Còn thiếu: {words}': '🎡 Missed: {words}',
  '🎡 Cả phòng đã tìm ra hết các từ!': '🎡 The room found every word!',
  '🎡 Vòng chữ: {ranking}': '🎡 Word Wheel: {ranking}',
  '🎡 Bậc thầy ghép chữ!': '🎡 Word master!',
  'Từ sai (không ghép được)': 'Wrong word (can\'t be spelled)',
  'Từ đúng: {word}': 'Right word: {word}',
  '{count} vòng': '{count} wheels',
  'Vòng {n}/{total} • Tìm được {found}/{count}': 'Wheel {n}/{total} • Found {found}/{count}',
  'Từ thưởng: {words}': 'Bonus words: {words}',

  // Tìm từ (wordSearch.ts)
  'Tìm từ 🔍': 'Word Search 🔍',
  'Bảng chữ giấu các từ tiếng Anh theo hàng ngang, dọc (mức Khó: cả chéo và viết ngược); gợi ý là nghĩa tiếng Việt. Thấy từ nào thì comment từ đó: ai tìm ra trước được điểm. Qua nửa thời gian, chữ đầu của các từ còn lại sáng lên.':
    'English words hide in the letter board across and down (Hard: also diagonal and backwards); the clues are Vietnamese meanings. Comment a word you spot: the first finder scores. Halfway through, the first letter of each word left lights up.',
  'Gõ từ tiếng Anh bạn tìm thấy trong bảng': 'Type an English word you found on the board',
  'Mức độ': 'Level',
  'Dễ: bảng 8×8, 6 từ ngang/dọc': 'Easy: 8×8 board, 6 words across/down',
  'Khó: bảng 10×10, 9 từ theo 8 hướng': 'Hard: 10×10 board, 9 words in 8 directions',
  'Điểm mỗi từ tìm ra': 'Points per word found',
  'Cần ít nhất 3 từ tiếng Anh một chữ (3–{max} chữ cái).': 'At least 3 single English words (3–{max} letters) are needed.',
  '💡 Gợi ý: chữ đầu của các từ còn lại đã sáng lên': '💡 Hint: the first letter of each word left lights up',
  '🔍 Còn {n} từ chưa ai tìm ra: {words}': '🔍 {n} word(s) nobody found: {words}',
  '🔍 Cả phòng đã tìm ra hết {n} từ!': '🔍 The room found all {n} words!',
  '🔍 Thợ săn chữ!': '🔍 Word hunter!',
  'Tìm sai': 'Wrong word',
  'Tìm đúng: {word}': 'Found: {word}',
  '🔍 Tìm {n} từ tiếng Anh': '🔍 Find {n} English words',
  'Đã tìm {found}/{total} • Gõ từ bạn thấy': 'Found {found}/{total} • Type the words you see'
};
