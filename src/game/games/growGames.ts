import { t } from '../../shared/i18n';
import { createQuestionRace } from './race';

/**
 * Question races with a picture that grows with each correct answer (same
 * engine as the duck race: first correct answer moves first, first to the
 * goal wins and gets the winner spotlight).
 */

export const balloonGame = createQuestionRace({
  id: 'thoiBong',
  title: 'Thổi bóng bay 🎈',
  accent: '#f43f5e',
  aliases: ['thoibong', 'balloon'],
  howTo: 'Mỗi câu hỏi comment a, b, c hoặc d. Hết giờ câu hỏi, ai trả lời đúng được thổi bóng to thêm (ai đúng trước thổi trước). Bóng ai to hết cỡ và nổ đầu tiên thì thắng và được chúc mừng trên màn hình; top 3 được thưởng điểm.',
  answerHelp: 'Trả lời câu hỏi: đúng = thổi bóng to thêm (chỉ tính lần đầu)',
  defaultGoal: 6,
  goalLabel: 'Số lần thổi để bóng nổ',
  goalHint: 'Mỗi câu trả lời đúng = 1 lần thổi.',
  picture: { grow: 'balloon' },
  progress: (steps, goal) => t('{steps}/{goal} lần thổi', { steps, goal }),
  askHint: (goal) => t('Đúng = thổi 1 hơi · bóng nổ sau {goal} hơi', { goal }),
  revealHint: (n) => t('🎈 {n} người đúng: bóng to thêm!', { n }),
  emptyHint: () => t('🎈 Trả lời đúng để bắt đầu thổi bóng!'),
  winText: (name) => t('💥 Bóng của {name} to nhất và nổ tung!', { name }),
  leadText: (name) => t('🎈 {name} có quả bóng to nhất!', { name }),
  moveText: () => '🎈 +1'
});

export const plantGame = createQuestionRace({
  id: 'trongCay',
  title: 'Trồng cây 🌱',
  accent: '#22c55e',
  aliases: ['trongcay', 'plant'],
  howTo: 'Mỗi câu hỏi comment a, b, c hoặc d. Hết giờ câu hỏi, ai trả lời đúng được tưới cây lớn thêm (ai đúng trước tưới trước): hạt → mầm → cây con → cây to. Cây ai ra quả đầu tiên thì thắng và được chúc mừng trên màn hình; top 3 được thưởng điểm.',
  answerHelp: 'Trả lời câu hỏi: đúng = tưới cây lớn thêm (chỉ tính lần đầu)',
  defaultGoal: 6,
  goalLabel: 'Số lần tưới để cây ra quả',
  goalHint: 'Mỗi câu trả lời đúng = 1 lần tưới.',
  picture: { grow: 'plant' },
  progress: (steps, goal) => t('{steps}/{goal} lần tưới', { steps, goal }),
  askHint: (goal) => t('Đúng = tưới 1 lần · cây ra quả sau {goal} lần', { goal }),
  revealHint: (n) => t('💧 {n} người đúng: cây lớn thêm!', { n }),
  emptyHint: () => t('🌰 Trả lời đúng để gieo hạt!'),
  winText: (name) => t('🍎 Cây của {name} ra quả đầu tiên!', { name }),
  leadText: (name) => t('🌳 {name} có cây cao nhất!', { name }),
  moveText: () => '💧 +1'
});

export const rocketGame = createQuestionRace({
  id: 'tenLua',
  title: 'Tên lửa lên Mặt Trăng 🚀',
  accent: '#6366f1',
  aliases: ['tenlua', 'rocket'],
  howTo: 'Mỗi câu hỏi comment a, b, c hoặc d. Hết giờ câu hỏi, ai trả lời đúng thì tên lửa bay cao thêm 1 tầng (ai đúng trước bay trước). Tên lửa ai chạm Mặt Trăng đầu tiên thì thắng và được chúc mừng trên màn hình; top 3 được thưởng điểm.',
  answerHelp: 'Trả lời câu hỏi: đúng = tên lửa bay cao thêm (chỉ tính lần đầu)',
  defaultGoal: 8,
  goalLabel: 'Số tầng bay lên Mặt Trăng',
  goalHint: 'Mỗi câu trả lời đúng = bay lên 1 tầng.',
  picture: { grow: 'rocket' },
  progress: (steps, goal) => t('{steps}/{goal} tầng', { steps, goal }),
  askHint: (goal) => t('Đúng = bay lên 1 tầng · Mặt Trăng ở tầng {goal}', { goal }),
  revealHint: (n) => t('🚀 {n} người đúng: bay lên 1 tầng!', { n }),
  emptyHint: () => t('🚀 Trả lời đúng để phóng tên lửa!'),
  winText: (name) => t('🌕 {name} đáp xuống Mặt Trăng đầu tiên!', { name }),
  leadText: (name) => t('🚀 {name} bay cao nhất!', { name }),
  moveText: () => '🚀 +1'
});

export const towerGame = createQuestionRace({
  id: 'xayThap',
  title: 'Xây tháp 🏰',
  accent: '#f59e0b',
  aliases: ['xaythap', 'tower'],
  howTo: 'Mỗi câu hỏi comment a, b, c hoặc d. Hết giờ câu hỏi, ai trả lời đúng được xây thêm 1 viên gạch (ai đúng trước xây trước). Tháp ai chạm mây đầu tiên thì thắng và được chúc mừng trên màn hình; top 3 được thưởng điểm.',
  answerHelp: 'Trả lời câu hỏi: đúng = thêm 1 viên gạch (chỉ tính lần đầu)',
  defaultGoal: 8,
  goalLabel: 'Số tầng để chạm mây',
  goalHint: 'Mỗi câu trả lời đúng = 1 viên gạch.',
  picture: { grow: 'tower' },
  progress: (steps, goal) => t('{steps}/{goal} tầng', { steps, goal }),
  askHint: (goal) => t('Đúng = +1 viên gạch · chạm mây ở tầng {goal}', { goal }),
  revealHint: (n) => t('🧱 {n} người đúng: tháp cao thêm!', { n }),
  emptyHint: () => t('🧱 Trả lời đúng để đặt viên gạch đầu tiên!'),
  winText: (name) => t('☁️ Tháp của {name} chạm mây đầu tiên!', { name }),
  leadText: (name) => t('🏰 {name} có tháp cao nhất!', { name }),
  moveText: () => '🧱 +1'
});
