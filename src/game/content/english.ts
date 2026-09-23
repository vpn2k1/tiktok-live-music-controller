/**
 * Default content for the English games. Streamers can replace every bank in
 * the app; each line is plain text split on "|" (answers may use "/" aliases).
 */

/** english[/alias] | nghĩa tiếng Việt */
export const VOCAB_BANK = [
  'apple | quả táo',
  'banana | quả chuối',
  'orange | quả cam',
  'teacher | giáo viên',
  'student/pupil | học sinh',
  'school | trường học',
  'family | gia đình',
  'mother/mom/mum | mẹ',
  'father/dad | bố',
  'friend | bạn bè',
  'house/home | ngôi nhà',
  'kitchen | nhà bếp',
  'window | cửa sổ',
  'water | nước',
  'elephant | con voi',
  'tiger | con hổ',
  'monkey | con khỉ',
  'rabbit | con thỏ',
  'butterfly | con bướm',
  'flower | bông hoa',
  'river | dòng sông',
  'mountain | ngọn núi',
  'beach | bãi biển',
  'weather | thời tiết',
  'umbrella | cái ô',
  'computer | máy tính',
  'bicycle/bike | xe đạp',
  'airplane/plane/aeroplane | máy bay',
  'happy | vui vẻ',
  'beautiful | xinh đẹp',
  'delicious | ngon',
  'difficult/hard | khó',
  'library | thư viện',
  'hospital | bệnh viện',
  'breakfast | bữa sáng',
  'birthday | sinh nhật',
  'yesterday | hôm qua',
  'tomorrow | ngày mai',
  'grandmother/grandma | bà',
  'chicken | con gà'
].join('\n');

/** emoji | answer[/alias] | gợi ý tiếng Việt */
export const EMOJI_BANK = [
  '🧈🪰 | butterfly | con bướm',
  '🌧️🎀 | rainbow | cầu vồng',
  '🦶⚽ | football | bóng đá',
  '🥚🌱 | eggplant | cà tím',
  '🧊🍦 | ice cream | kem',
  '🔥🪰 | firefly | đom đóm',
  '🍵🍲 | teapot | ấm trà',
  '☀️🌻 | sunflower | hoa hướng dương',
  '❄️⛄ | snowman | người tuyết',
  '⭐🐟 | starfish | sao biển',
  '🏠👷 | homework | bài tập về nhà',
  '📚🐛 | bookworm | mọt sách',
  '🐴👞 | horseshoe | móng ngựa',
  '🍎🥧 | apple pie | bánh táo',
  '🎂🎉 | birthday party | tiệc sinh nhật',
  '⭐🎬 | movie star/film star | ngôi sao điện ảnh',
  '☀️👓 | sunglasses | kính râm',
  '🌊🏄 | surfing | lướt sóng'
].join('\n');

/** sentence | nghĩa tiếng Việt */
export const SENTENCE_BANK = [
  'I go to school every day | Tôi đi học mỗi ngày',
  'She likes to read books | Cô ấy thích đọc sách',
  'They are playing football in the park | Họ đang chơi bóng đá trong công viên',
  'We had dinner at seven o\'clock | Chúng tôi ăn tối lúc bảy giờ',
  'My brother is taller than me | Anh trai tôi cao hơn tôi',
  'Can you help me with my homework | Bạn giúp tôi làm bài tập được không',
  'What time does the movie start | Mấy giờ bộ phim bắt đầu',
  'He has lived here for five years | Anh ấy đã sống ở đây năm năm',
  'It is raining outside now | Bây giờ bên ngoài đang mưa',
  'I have never been to London | Tôi chưa bao giờ đến London',
  'Where did you buy that bag | Bạn đã mua cái túi đó ở đâu',
  'The cat is sleeping under the table | Con mèo đang ngủ dưới gầm bàn',
  'Please turn off the lights | Làm ơn tắt đèn',
  'She is good at playing the piano | Cô ấy chơi piano giỏi',
  'How many languages can you speak | Bạn nói được bao nhiêu ngôn ngữ'
].join('\n');

/** Category | answer[/alias] | answer | … (2–12 answers) */
export const CATEGORY_BANK = [
  'Fruits 🍎 | apple | banana | orange | mango | grape | watermelon | pineapple | strawberry | lemon | peach',
  'Farm animals 🐄 | cow | pig | chicken/hen/rooster | horse | sheep | goat | duck | dog | cat | rabbit',
  'Colors 🎨 | red | blue | green | yellow | black | white | pink | purple | orange | brown',
  'Jobs 👩‍⚕️ | teacher | doctor | nurse | farmer | engineer | police officer/policeman/policewoman | chef/cook | driver | singer | pilot',
  'Body parts 🧍 | head | hand | eye | nose | mouth | ear | leg | arm | foot/feet | hair',
  'Days of the week 📅 | monday | tuesday | wednesday | thursday | friday | saturday | sunday',
  'In the classroom 🏫 | desk | chair | board/whiteboard/blackboard | book | pen | pencil | ruler | eraser/rubber | schoolbag/bag | clock',
  'Weather ☀️ | sunny | rainy | cloudy | windy | snowy | stormy | foggy | hot | cold | warm',
  'Sports ⚽ | football/soccer | basketball | volleyball | tennis | badminton | swimming | running | baseball | golf | boxing'
].join('\n');

/** Question | A | B | C | D | correct letter */
export const ENGLISH_QUIZ_BANK = [
  'She ___ to school every day. | go | goes | going | gone | B',
  'I ___ a student. | am | is | are | be | A',
  'They ___ football yesterday. | play | plays | played | playing | C',
  'Past tense of "buy"? | buyed | bought | brought | buys | B',
  'Which word is a fruit? | carrot | potato | mango | onion | C',
  'Opposite of "hot"? | warm | cold | big | fast | B',
  '"Con mèo" in English? | dog | cat | mouse | bird | B',
  'He is ___ than his brother. | tall | taller | tallest | more tall | B',
  'I have lived here ___ 2020. | for | since | from | at | B',
  'There ___ many books on the table. | is | are | am | be | B',
  'What ___ you do last weekend? | do | does | did | done | C',
  'Plural of "child"? | childs | childes | children | childrens | C',
  'We are going ___ the cinema tonight. | to | at | in | on | A',
  'Best reply to "Thank you"? | Yes, please | You\'re welcome | Sorry | Goodbye | B',
  'Which sentence is correct? | She don\'t like milk | She doesn\'t like milk | She not like milk | She isn\'t like milk | B',
  'My birthday is ___ May. | on | at | in | by | C',
  'If it rains, I ___ at home. | stay | will stay | stayed | staying | B',
  'Synonym of "big"? | small | large | short | thin | B',
  'How ___ apples do you want? | much | many | long | often | B',
  'The sun ___ in the east. | rise | rises | rising | rose | B'
].join('\n');
