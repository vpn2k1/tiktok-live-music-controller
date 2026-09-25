/** English entries (Vietnamese source text → English). See ../i18n.ts. */
export const EN_GAMES1: Record<string, string> = {
  // ---------- Shared runtime texts (answer series, quiz, hangman, crossword) ----------
  '🏁 Tổng kết': '🏁 Final results',
  'Hết lượt': 'Round over',
  'Trả lời sai': 'Wrong answer',
  'Comment tiếng Việt': 'Vietnamese comment',
  'Trả lời đúng: {answer}': 'Correct answer: {answer}',
  'Trả lời đúng ({letter})': 'Correct answer ({letter})',
  'Đáp án: {answer}': 'Answer: {answer}',
  'Đáp án: {answer}.': 'Answer: {answer}.',
  'Đáp án {letter}: {answer}': 'Answer {letter}: {answer}',
  'Đáp án {letter}': 'Answer {letter}',
  '{questions} câu • {players} người có điểm': '{questions} questions • {players} scored',
  '{words} từ • {players} người có điểm': '{words} words • {players} scored',
  '{count} người đúng': '{count} correct',
  '{count} người đã trả lời': '{count} answered',
  'Nghĩa: {meaning}': 'Meaning: {meaning}',
  'Gợi ý: {hint}': 'Hint: {hint}',
  'Ngân hàng câu hỏi trống hoặc sai định dạng.': 'The question bank is empty or badly formatted.',
  'Bộ câu hỏi trống hoặc sai định dạng.': 'The question set is empty or badly formatted.',
  'Comment đúng / sai': 'Comment true / false',

  // ---------- Answer-game factory (createAnswerGame) metadata ----------
  'đáp án tiếng Anh': 'English answer',
  'Gõ thẳng đáp án': 'Just type the answer',
  'Cách viết khác': 'Alternative form',
  'Bộ câu có sẵn': 'Built-in set',
  'Chấm điểm': 'Scoring',
  'Mọi người đúng đều có điểm (nhanh hơn nhiều điểm hơn)': 'Everyone correct scores (faster = more points)',
  'Có người đúng là sang câu': 'Next question at the first correct answer',
  'Để trống = dùng bộ có sẵn ở trên. ': 'Leave empty = use the built-in set above. ',

  // ---------- Unscramble / Translate / Emoji Guess / Sentence Builder ----------
  'Màn hình hiện các chữ cái bị xáo trộn và nghĩa tiếng Việt. Viewer gõ từ tiếng Anh đúng.':
    'The screen shows scrambled letters and the Vietnamese meaning. Viewers type the English word.',
  'Màn hình hiện các chữ cái bị xáo trộn và nghĩa tiếng Việt. Viewer gõ từ tiếng Anh đúng. Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The screen shows scrambled letters and the Vietnamese meaning. Viewers type the English word. Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Từ vựng': 'Vocabulary',
  'Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt': 'Each line: english[/other word] | Vietnamese meaning',
  'Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: english[/other word] | Vietnamese meaning. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Nghĩa: {meaning} • Gõ từ tiếng Anh': 'Meaning: {meaning} • Type the English word',
  'Dịch nhanh 🇻🇳→🇬🇧': 'Quick Translate 🇻🇳→🇬🇧',
  'Màn hình hiện từ tiếng Việt. Viewer gõ nghĩa tiếng Anh (chấp nhận các từ đồng nghĩa trong ngân hàng).':
    'The screen shows a Vietnamese word. Viewers type the English meaning (synonyms listed in the bank are accepted).',
  'Màn hình hiện từ tiếng Việt. Viewer gõ nghĩa tiếng Anh (chấp nhận các từ đồng nghĩa trong ngân hàng). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The screen shows a Vietnamese word. Viewers type the English meaning (synonyms listed in the bank are accepted). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Ghép các emoji thành một từ tiếng Anh (vd 🧈🪰 = butterfly).': 'Combine the emoji into one English word (e.g. 🧈🪰 = butterfly).',
  'Ghép các emoji thành một từ tiếng Anh (vd 🧈🪰 = butterfly). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'Combine the emoji into one English word (e.g. 🧈🪰 = butterfly). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Câu đố emoji': 'Emoji puzzles',
  'Mỗi dòng: emoji | answer[/đáp án khác] | gợi ý tiếng Việt': 'Each line: emoji | answer[/other answer] | Vietnamese hint',
  'Mỗi dòng: emoji | answer[/đáp án khác] | gợi ý tiếng Việt Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: emoji | answer[/other answer] | Vietnamese hint. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Các từ của một câu bị xáo trộn. Viewer gõ lại câu đúng thứ tự (không cần dấu câu, không phân biệt hoa thường).':
    'The words of a sentence are shuffled. Viewers type the sentence in the right order (no punctuation needed, case-insensitive).',
  'Các từ của một câu bị xáo trộn. Viewer gõ lại câu đúng thứ tự (không cần dấu câu, không phân biệt hoa thường). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The words of a sentence are shuffled. Viewers type the sentence in the right order (no punctuation needed, case-insensitive). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Câu mẫu': 'Sentences',
  'Mỗi dòng: câu tiếng Anh | nghĩa tiếng Việt': 'Each line: English sentence | Vietnamese meaning',
  'Mỗi dòng: câu tiếng Anh | nghĩa tiếng Việt Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: English sentence | Vietnamese meaning. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Sắp xếp lại thành câu đúng': 'Put the words in the right order',

  // ---------- Quiz factory (createQuizGame) ----------
  'Tiếng Anh – dễ (mới bắt đầu)': 'English – easy (beginners)',
  'Tiếng Anh – dễ (mới bắt đầu) · {0} câu': 'English – easy (beginners) · {0} questions',
  'Tiếng Anh – ngữ pháp & từ vựng': 'English – grammar & vocabulary',
  'Tiếng Anh – ngữ pháp & từ vựng · {0} câu': 'English – grammar & vocabulary · {0} questions',
  'Kiến thức chung (tiếng Việt)': 'General knowledge (Vietnamese)',
  'Kiến thức chung (tiếng Việt) · {0} câu': 'General knowledge (Vietnamese) · {0} questions',
  'Comment a, b, c hoặc d để chọn đáp án (chỉ tính lần đầu). Đúng càng nhanh càng nhiều điểm; mỗi lượt nhiều câu, hết lượt xếp hạng.':
    'Comment a, b, c or d to pick an answer (only your first answer counts). The faster you are right, the more points; several questions per round, ranking at the end.',
  'Chọn đáp án (chữ thường hay hoa đều được, không đổi được)': 'Pick an answer (lower or upper case, can’t be changed)',
  'Bộ câu hỏi có sẵn': 'Built-in question set',
  'Câu hỏi riêng (tuỳ chọn)': 'Your own questions (optional)',
  'Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). 2–4 lựa chọn.':
    'Each line: Question | A | B | C | D | Correct answer (letter A–D or the answer text). 2–4 options.',
  'Để trống = dùng bộ câu hỏi có sẵn ở trên. Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). 2–4 lựa chọn. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Leave empty = use the built-in question set above. Each line: Question | A | B | C | D | Correct answer (letter A–D or the answer text). 2–4 options. You can import a .txt / .csv file (Excel, Google Sheets).',
  // Composites for quiz games defined in other files (trueFalse.ts): the factory joins their labels / bank hint.
  'Tiếng Anh – dễ · {0} câu': 'English – easy · {0} questions',
  'Kiến thức (tiếng Việt) · {0} câu': 'General knowledge (Vietnamese) · {0} questions',
  'Để trống = dùng bộ câu hỏi có sẵn ở trên. Mỗi dòng: câu nhận định | đúng hoặc sai (true/false). Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Leave empty = use the built-in question set above. Each line: statement | đúng or sai (true/false). You can import a .txt / .csv file (Excel, Google Sheets).',

  // ---------- Hangman ----------
  'Mỗi lượt nhiều từ. Comment 1 chữ cái để lật từ bí mật, hoặc gõ cả từ nếu đã đoán ra. Chữ cái sai bị trừ lượt. Lật đúng chữ có điểm, đoán ra cả từ càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'Several words per round. Comment one letter to reveal the secret word, or type the whole word if you know it. Wrong letters cost a life. Revealed letters score points, and the faster you solve the word, the more points; the round ends with a ranking of total points.',
  'Đoán 1 chữ cái': 'Guess one letter',
  'Đoán cả từ': 'Guess the whole word',
  'Số từ mỗi lượt': 'Words per round',
  'Giây mỗi từ': 'Seconds per word',
  'Số lần sai tối đa': 'Max wrong guesses',
  'Mỗi dòng: english | nghĩa tiếng Việt (chỉ dùng từ đơn 3–16 chữ cái). Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: english | Vietnamese meaning (single words of 3–16 letters only). You can import a .txt / .csv file (Excel, Google Sheets).',
  'Không có từ hợp lệ (từ đơn 3–16 chữ cái).': 'No valid words (single words of 3–16 letters).',
  '🎉 {name} tìm ra “{word}” ({meaning}) sau {time}!': '🎉 {name} found “{word}” ({meaning}) in {time}!',
  'Từ đúng là “{word}” ({meaning}).': 'The word was “{word}” ({meaning}).',
  '{name}: “{letter}” không có ❌': '{name}: no “{letter}” ❌',
  'Chữ đúng: {letter}': 'Right letter: {letter}',
  'Chữ sai: {letter}': 'Wrong letter: {letter}',
  'Đoán cả từ: {word}': 'Guess the word: {word}',
  'Từ {n}/{total}': 'Word {n}/{total}',
  'Sai {wrong}/{max}': 'Misses {wrong}/{max}',
  'Lượt còn lại': 'Lives left',
  '{count} chữ': '{count} letters',

  // ---------- Crossword (Ô chữ) ----------
  'Ô chữ 🔠': 'Crossword 🔠',
  'Mỗi hàng ngang là một câu hỏi: gõ đáp án để mở hàng. Chữ ở cột tô màu ghép thành từ khóa hàng dọc — gõ từ khóa bất cứ lúc nào, đoán càng sớm càng nhiều điểm.':
    'Each row is a question: type the answer to open the row. The letters in the highlighted column spell the vertical keyword — type the keyword any time; the earlier you guess, the more points.',
  'đáp án hàng ngang': 'row answer',
  'Gõ thẳng đáp án (không cần dấu, cách)': 'Just type the answer (accents and spaces optional)',
  'từ khóa': 'keyword',
  'Gõ từ khóa hàng dọc bất cứ lúc nào': 'Type the vertical keyword any time',
  'Bộ ô chữ có sẵn': 'Built-in crosswords',
  'Từ tiếng Anh, gợi ý tiếng Việt': 'English words, Vietnamese clues',
  'Từ tiếng Anh, gợi ý tiếng Việt · {0} ô chữ': 'English words, Vietnamese clues · {0} crosswords',
  'Kiến thức tiếng Việt': 'Vietnamese knowledge',
  'Kiến thức tiếng Việt · {0} ô chữ': 'Vietnamese knowledge · {0} crosswords',
  'Giây mỗi hàng ngang': 'Seconds per row',
  'Giây đoán từ khóa cuối': 'Seconds for the final keyword guess',
  'Điểm tối đa mỗi hàng': 'Max points per row',
  'Trả lời ngay = điểm tối đa, sát hết giờ = một nửa.': 'Instant answer = max points, at the buzzer = half.',
  'Điểm từ khóa': 'Keyword points',
  'Đoán khi chưa mở hàng nào = đủ điểm, mở hết = một nửa.': 'Guessed before any row opens = full points, all rows open = half.',
  'Giây xem đáp án hàng': 'Seconds to show the row answer',
  'Hàng không ai trả lời': 'Rows nobody answered',
  'Vẫn hiện đáp án (dễ hơn)': 'Still show the answer (easier)',
  'Giữ kín như Olympia (khó hơn)': 'Keep it hidden, Olympia-style (harder)',
  'Chấm điểm hàng ngang': 'Row scoring',
  'Có người đúng là mở hàng': 'Open the row at the first correct answer',
  'Thứ tự ô chữ': 'Crossword order',
  'Ngẫu nhiên (không lặp đến khi hết)': 'Random (no repeats until all used)',
  'Đúng thứ tự trong ngân hàng / file': 'Same order as the bank / file',
  'Ô chữ riêng (tuỳ chọn)': 'Your own crosswords (optional)',
  'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng 1 ô chữ: TỪKHÓA : gợi ý | câu hỏi = đáp án | … (mỗi chữ của từ khóa 1 hàng; đáp án hàng thứ i phải chứa chữ thứ i của từ khóa). Nhập được file .txt / .csv.':
    'Leave empty = use the built-in set above. One crossword per line: KEYWORD : hint | question = answer | … (one row per keyword letter; the answer of row i must contain letter i of the keyword). You can import a .txt / .csv file.',
  'Không có ô chữ hợp lệ.': 'No valid crosswords.',
  'Hàng {n}: {answer}': 'Row {n}: {answer}',
  'Hàng {n}: chưa ai trả lời — đáp án {answer}': 'Row {n}: nobody got it — answer {answer}',
  'Hàng {n}: chưa ai trả lời': 'Row {n}: nobody got it',
  '🔑 Đoán từ khóa hàng dọc!': '🔑 Guess the vertical keyword!',
  '🎉 {name} đoán ra từ khóa “{keyword}” (+{points})!': '🎉 {name} cracked the keyword “{keyword}” (+{points})!',
  '🔑 Từ khóa là “{keyword}”.': '🔑 The keyword was “{keyword}”.',
  '🏆 {name} {points}đ': '🏆 {name} {points} pts',
  'Đúng hàng {n}: {answer}': 'Row {n} right: {answer}',
  'Đoán từ khóa: {keyword}': 'Guess the keyword: {keyword}',
  '{name} đoán ra từ khóa (+{points})': '{name} cracked the keyword (+{points})',
  'Không ai đoán ra từ khóa': 'Nobody cracked the keyword',
  '🔑 Từ khóa hàng dọc là gì?': '🔑 What’s the vertical keyword?',
  '{count} chữ cái': '{count} letters',
  '+{points} điểm': '+{points} pts',
  'Hàng {n}/{total} • {letters} chữ cái • Từ khóa: {pattern} (+{points})': 'Row {n}/{total} • {letters} letters • Keyword: {pattern} (+{points})',

  // ---------- Japanese ----------
  'Đọc Kana 🎌': 'Read the Kana 🎌',
  'Màn hình hiện chữ Hiragana / Katakana: gõ cách đọc bằng romaji (vd あ = a, ねこ = neko).':
    'The screen shows Hiragana / Katakana: type the reading in romaji (e.g. あ = a, ねこ = neko).',
  'Màn hình hiện chữ Hiragana / Katakana: gõ cách đọc bằng romaji (vd あ = a, ねこ = neko). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The screen shows Hiragana / Katakana: type the reading in romaji (e.g. あ = a, ねこ = neko). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Gõ cách đọc (vd a, shi, neko) hoặc gõ lại bằng kana': 'Type the reading (e.g. a, shi, neko) or retype it in kana',
  'Chữ / từ': 'Characters / words',
  'Chữ / từ riêng (tuỳ chọn)': 'Your own characters / words (optional)',
  'Mỗi dòng: kana | romaji[/cách viết khác] | nghĩa (tuỳ chọn).': 'Each line: kana | romaji[/other spelling] | meaning (optional).',
  'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng: kana | romaji[/cách viết khác] | nghĩa (tuỳ chọn). Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Leave empty = use the built-in set above. Each line: kana | romaji[/other spelling] | meaning (optional). You can import a .txt / .csv file (Excel, Google Sheets).',
  'Hiragana (46 chữ)': 'Hiragana (46 characters)',
  'Hiragana ({0} chữ) · {1} câu': 'Hiragana ({0} characters) · {1} questions',
  'Katakana (46 chữ)': 'Katakana (46 characters)',
  'Katakana ({0} chữ) · {1} câu': 'Katakana ({0} characters) · {1} questions',
  'Từ ngắn bằng kana': 'Short kana words',
  'Từ ngắn bằng kana · {0} câu': 'Short kana words · {0} questions',
  'Nghĩa: {meaning} • Gõ romaji': 'Meaning: {meaning} • Type romaji',
  'Gõ cách đọc bằng romaji': 'Type the reading in romaji',
  'Từ vựng tiếng Nhật 🗾': 'Japanese Vocabulary 🗾',
  'Màn hình hiện nghĩa tiếng Việt: gõ từ tiếng Nhật (chữ Hán, kana hoặc romaji đều được).':
    'The screen shows a Vietnamese meaning: type the Japanese word (kanji, kana or romaji all work).',
  'Màn hình hiện nghĩa tiếng Việt: gõ từ tiếng Nhật (chữ Hán, kana hoặc romaji đều được). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The screen shows a Vietnamese meaning: type the Japanese word (kanji, kana or romaji all work). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Gõ bằng bàn phím Nhật hoặc romaji': 'Type with a Japanese keyboard or in romaji',
  'Mỗi dòng: chữ Nhật | cách đọc/romaji[/cách khác] | nghĩa tiếng Việt.': 'Each line: Japanese word | reading/romaji[/other form] | Vietnamese meaning.',
  'Mỗi dòng: chữ Nhật | cách đọc/romaji[/cách khác] | nghĩa tiếng Việt. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: Japanese word | reading/romaji[/other form] | Vietnamese meaning. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Gõ tiếng Nhật: chữ Hán, kana hoặc romaji': 'Type in Japanese: kanji, kana or romaji',
  'Quiz tiếng Nhật 🍣': 'Japanese Quiz 🍣',
  'Tiếng Nhật cơ bản': 'Basic Japanese',
  'Tiếng Nhật cơ bản · {0} câu': 'Basic Japanese · {0} questions',
  'Ghép cặp Kana 🎴': 'Kana Pairs 🎴',
  'Thẻ úp giấu chữ Hiragana và cách đọc romaji. Comment 2 số (vd "3 8") để lật: đúng cặp (あ – a) thì giữ lại và được điểm.':
    'Face-down cards hide Hiragana and their romaji readings. Comment 2 numbers (e.g. "3 8") to flip: a matching pair (あ – a) stays open and scores.',

  // ---------- Chinese ----------
  'Đọc Pinyin 🀄': 'Read the Pinyin 🀄',
  'Màn hình hiện chữ Hán: gõ pinyin (có dấu thanh, số thanh hoặc không dấu đều được — nǐ hǎo = ni3hao3 = nihao).':
    'The screen shows Chinese characters: type the pinyin (tone marks, tone numbers or none — nǐ hǎo = ni3hao3 = nihao).',
  'Màn hình hiện chữ Hán: gõ pinyin (có dấu thanh, số thanh hoặc không dấu đều được — nǐ hǎo = ni3hao3 = nihao). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The screen shows Chinese characters: type the pinyin (tone marks, tone numbers or none — nǐ hǎo = ni3hao3 = nihao). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Gõ pinyin, dấu thanh không bắt buộc': 'Type pinyin, tone marks optional',
  'Mỗi dòng: chữ Hán | pinyin[/cách khác] | nghĩa tiếng Việt.': 'Each line: characters | pinyin[/other form] | Vietnamese meaning.',
  'Mỗi dòng: chữ Hán | pinyin[/cách khác] | nghĩa tiếng Việt. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: characters | pinyin[/other form] | Vietnamese meaning. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Nghĩa: {meaning} • Gõ pinyin': 'Meaning: {meaning} • Type pinyin',
  'Gõ pinyin': 'Type pinyin',
  'Từ vựng tiếng Trung 🐉': 'Chinese Vocabulary 🐉',
  'Màn hình hiện nghĩa tiếng Việt: gõ từ tiếng Trung (chữ Hán hoặc pinyin đều được).':
    'The screen shows a Vietnamese meaning: type the Chinese word (characters or pinyin both work).',
  'Màn hình hiện nghĩa tiếng Việt: gõ từ tiếng Trung (chữ Hán hoặc pinyin đều được). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'The screen shows a Vietnamese meaning: type the Chinese word (characters or pinyin both work). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Gõ chữ Hán hoặc pinyin': 'Type characters or pinyin',
  'Mỗi dòng: chữ Hán | pinyin | nghĩa tiếng Việt.': 'Each line: characters | pinyin | Vietnamese meaning.',
  'Mỗi dòng: chữ Hán | pinyin | nghĩa tiếng Việt. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: characters | pinyin | Vietnamese meaning. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Gõ tiếng Trung: chữ Hán hoặc pinyin': 'Type in Chinese: characters or pinyin',
  'Quiz tiếng Trung 🏮': 'Chinese Quiz 🏮',
  'Tiếng Trung cơ bản (HSK 1)': 'Basic Chinese (HSK 1)',
  'Tiếng Trung cơ bản (HSK {0}) · {1} câu': 'Basic Chinese (HSK {0}) · {1} questions',
  'Ghép cặp chữ Hán 🧧': 'Hanzi Pairs 🧧',
  'Thẻ úp giấu chữ Hán và nghĩa tiếng Việt. Comment 2 số (vd "3 8") để lật: đúng cặp (猫 – mèo) thì giữ lại và được điểm.':
    'Face-down cards hide Chinese characters and their Vietnamese meanings. Comment 2 numbers (e.g. "3 8") to flip: a matching pair (猫 – mèo) stays open and scores.',

  // ---------- Composites for answer games defined in vietnameseGames.ts (the factory joins howTo / bank hint) ----------
  'Nhìn các emoji, đoán từ tiếng Việt (gõ có dấu hay không dấu đều được). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'Look at the emoji and guess the Vietnamese word (with or without accents). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Mỗi dòng: emoji | đáp án[/đáp án khác] | gợi ý. Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: emoji | answer[/other answer] | hint. You can import a .txt / .csv file (Excel, Google Sheets).',
  'Câu đố mẹo dân gian: gõ đáp án (có dấu hay không dấu đều được). Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.':
    'Vietnamese folk trick riddles: type the answer (with or without accents). Several questions per round; the faster you answer, the more points; the round ends with a ranking of total points.',
  'Mỗi dòng: câu đố | đáp án[/đáp án khác] | gợi ý (tuỳ chọn). Nhập được file .txt / .csv (Excel, Google Sheets).':
    'Each line: riddle | answer[/other answer] | hint (optional). You can import a .txt / .csv file (Excel, Google Sheets).'
};
