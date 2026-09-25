/**
 * Default crossword puzzles ("Ô chữ", like Olympia's obstacle round). Each line:
 * KEYWORD : hint | clue = answer | clue = answer | …
 * One row per keyword letter; the i-th row's answer must contain the i-th
 * keyword letter (rows are aligned on it). Answers are compared without
 * accents, spaces or case, so Vietnamese answers work too.
 */

/** English words with Vietnamese clues (for English-learning streams). */
export const CROSSWORD_EN = [
  'SUN : ở trên trời, chiếu sáng ban ngày | Con rắn 🐍 = snake | Xe buýt 🚌 = bus | Mũi 👃 = nose',
  'CAT : con vật nuôi kêu meo meo | Bánh ngọt 🍰 = cake | Quả táo 🍎 = apple | Cái cây 🌳 = tree',
  'BOOK : dùng để đọc | Quả chuối 🍌 = banana | Quả cam 🍊 = orange | Con bò 🐄 = cow | Nhà bếp 🍳 = kitchen',
  'HAPPY : cảm xúc khi vui | Cái mũ 🎩 = hat | Con kiến 🐜 = ant | Con lợn 🐷 = pig | Bút chì ✏️ = pencil | Màu vàng 💛 = yellow',
  'SCHOOL : nơi học sinh đến mỗi ngày | Ngôi sao ⭐ = star | Con mèo 🐱 = cat | Ngôi nhà 🏠 = house | Con cú 🦉 = owl | Mặt trăng 🌙 = moon | Sư tử 🦁 = lion',
  'FAMILY : bố, mẹ và con | Con cá 🐟 = fish | Máy bay ✈️ = airplane | Con khỉ 🐒 = monkey | Kem 🍦 = ice cream | Quả chanh 🍋 = lemon | Hôm qua = yesterday',
  'WATER : chúng ta uống mỗi ngày | Cửa sổ 🪟 = window | Mùa thu 🍂 = autumn | Con hổ 🐯 = tiger | Con voi 🐘 = elephant | Con thỏ 🐰 = rabbit',
  'MUSIC : nghe bằng tai, có giai điệu | Mẹ 👩 = mother | Cái ô ☂️ = umbrella | Mùa hè ☀️ = summer | Hòn đảo 🏝️ = island | Đồng hồ ⏰ = clock',
  'PIZZA : món ăn Ý hình tròn | Gấu trúc 🐼 = panda | Côn trùng 🐞 = insect | Ngựa vằn 🦓 = zebra | Sở thú 🦁 = zoo | Cánh tay 💪 = arm',
  'FRIEND : người bạn chơi cùng | Bông hoa 🌸 = flower | Cầu vồng 🌈 = rainbow | Bệnh viện 🏥 = hospital | Quả trứng 🥚 = egg | Ban đêm 🌃 = night | Con vịt 🦆 = duck',
  'SPORT : bóng đá, bơi lội… | Đôi giày 👟 = shoes | Công viên 🏞️ = park | Đại dương 🌊 = ocean | Con đường 🛣️ = road | Tàu hỏa 🚆 = train',
  'GREEN : màu của lá cây | Con dê 🐐 = goat | Cơm, gạo 🍚 = rice | Cái tai 👂 = ear | Con mắt 👁️ = eye | Quyển vở 📓 = notebook',
  'HELLO : lời chào | Bàn tay ✋ = hand | Buổi tối 🌆 = evening | Thư viện 📚 = library | Cái chân 🦵 = leg | Củ hành 🧅 = onion',
  'MONKEY : con vật thích ăn chuối | Tiền 💵 = money | Mở ra 📖 = open | Y tá 👩‍⚕️ = nurse | Con diều 🪁 = kite | Dễ dàng = easy | Sữa chua 🥣 = yogurt',
  'TEACHER : người dạy học | Cái răng 🦷 = tooth | Số tám 8️⃣ = eight | Cô, dì 👩 = aunt | Con bò 🐄 = cow | Trái tim ❤️ = heart | Trái đất 🌍 = earth | Màu đỏ 🔴 = red'
].join('\n');

/** Vietnamese general knowledge (typed with or without accents). */
export const CROSSWORD_VI = [
  'HUE : cố đô của Việt Nam | Loài hoa biểu tượng của Việt Nam = hoa sen | Mùa hoa đào nở ở miền Bắc = mùa xuân | Con vật kêu "ộp ộp" = ếch',
  'TET : ngày lễ lớn nhất trong năm | Con giáp đứng đầu = con chuột | Người dạy học = giáo viên | Hành tinh chúng ta đang sống = trái đất',
  'BIEN : nơi có sóng, cát và nước mặn | Món ăn kẹp nhân nổi tiếng của Việt Nam = bánh mì | Con vật có vòi dài = con voi | Con vật kêu "ộp ộp" = ếch | Việt ___ = nam',
  'MUAHE : mùa nóng nhất trong năm | Con vật kêu "meo meo" = con mèo | Loại quả nhiều gai, mùi nồng = sầu riêng | Trang phục truyền thống của phụ nữ Việt Nam = áo dài | Thủ đô của Việt Nam = Hà Nội | Con vật kêu "be be" = con dê',
  'SACH : dùng để đọc và học | Dòng sông chảy qua Hà Nội = sông Hồng | Thành phố ngàn hoa = Đà Lạt | Con vật bơi dưới nước, có vây = con cá | Loài hoa mọc trong đầm = hoa sen',
  'BONGDA : môn thể thao vua | Món ăn nổi tiếng Hà Nội ăn với chả = bún chả | Con vật gáy "ò ó o" buổi sáng = gà trống | Mùa lạnh nhất năm = mùa đông | Người dạy học = giáo viên | Quả vỏ xanh ruột đỏ = dưa hấu | Trang phục truyền thống của phụ nữ Việt Nam = áo dài',
  'VIETNAM : đất nước hình chữ S | Con vật có vòi dài = con voi | Thủ đô của Việt Nam = Hà Nội | Con vật kêu "ộp ộp" = ếch | Hành tinh chúng ta đang sống = trái đất | Mùa hoa đào nở ở miền Bắc = mùa xuân | Trang phục truyền thống của phụ nữ Việt Nam = áo dài | Con vật kêu "meo meo" = con mèo',
  'HOCTRO : người đi học | Loài hoa biểu tượng của Việt Nam = hoa sen | Món nước nổi tiếng: ___ bò = phở | Con vật bơi dưới nước, có vây = con cá | Hành tinh chúng ta đang sống = trái đất | Con vật đứng thứ 5 trong 12 con giáp = con rồng | Con vật làm ra mật = con ong'
].join('\n');
