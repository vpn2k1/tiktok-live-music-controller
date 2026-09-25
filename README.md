# TikLiveVPN — TikTok LIVE game controller (React + Electron)

> **TypeScript version:** React UI is TSX; Electron and tooling are TypeScript. See `docs/TYPESCRIPT.md`.


Desktop app dùng **React thuần + Electron** để:

- Kết nối một TikTok account đang LIVE.
- Đọc comment / gift / like / follow realtime qua `tiktok-live-connector`.
- Chọn file nhạc local bằng native file picker.
- Play / Pause / Next / Previous / Volume.
- Rule mẫu:
  - nghe đủ N giây → next;
  - comment `!next` → next;
  - comment `1`, `2`, `3` → chọn bài theo số thứ tự;
  - comment `!song chill` → tìm filename chứa `chill`;
  - đủ N likes → next;
  - đủ N gift có tên chỉ định → next.
- Có nút giả lập event để test khi chưa LIVE.
- **Overlay cho OBS / TikTok LIVE Studio**: chọn khung 9:16 hoặc 16:9, chọn phần hiển thị (game, bảng xếp hạng, bài đang phát), xem trước ngay trong app.
- **Khung game:** chọn game, trạng thái vòng chơi, bộ đếm giờ, điểm từng viewer, chống spam comment.
- **Chơi liên tục:** game đang chơi tự chạy ván mới mãi đến khi có lệnh đổi game (quà, `!doigame`) hoặc streamer đổi tay. Lệnh đổi game luôn chờ hết ván, chúc mừng người thắng (màn hình lớn có tên + avatar: top 3 trên bục, hoặc người về đích đầu tiên) rồi mới về danh sách game cho viewer chọn; không ai chọn hoặc hoà phiếu thì báo và bốc ngẫu nhiên.
- **Đua bằng câu hỏi:** mỗi câu trả lời đúng tiến +1 (ai đúng trước tiến trước), về đích đầu tiên thắng; dùng bộ câu hỏi có sẵn hoặc câu hỏi riêng / AI tạo. 5 kiểu: Đua vịt (làn đua), Thổi bóng bay (bóng phồng đến khi nổ), Trồng cây (hạt → cây ra quả), Tên lửa lên Mặt Trăng, Xây tháp chạm mây.
- **20 game giải trí:** Quiz A/B/C/D, Rung chuông vàng, Kéo Búa Bao, Phe nào đông hơn?, Gỡ bom, Lật hình ghép cặp, Thử thách tim, Đuổi hình bắt chữ, Câu đố vui, Ước lượng, Đánh boss, Nối chữ, Đoán số, Ai nhanh tay, Đua vịt, Thổi bóng bay, Trồng cây, Tên lửa lên Mặt Trăng, Xây tháp, Vòng quay thử thách.
- **5 game đối kháng ⚔️:** Thành trì Đỏ – Xanh (2 phe bắn thành bằng !ban / tim / quà), Quiz Đỏ – Xanh (2 phe thi trả lời A/B/C/D), Đấu súng miền Tây (1–1, ai !ban trước khi thấy "BẮN!" thì thắng), Vua của đồi (tranh vương miện bằng !cuop, giữ càng lâu càng nhiều điểm), Team battle (2 đội đua điểm bằng tim / quà).
- **4 game tiếng Nhật 🇯🇵:** Đọc Kana (Hiragana / Katakana / từ ngắn → romaji), Từ vựng tiếng Nhật (nghĩa Việt → chữ Nhật / kana / romaji), Quiz tiếng Nhật, Ghép cặp Kana.
- **4 game tiếng Trung 🇨🇳:** Đọc Pinyin (chữ Hán → pinyin, dấu thanh tuỳ ý), Từ vựng tiếng Trung (nghĩa Việt → chữ Hán / pinyin), Quiz tiếng Trung (HSK 1), Ghép cặp chữ Hán.
- **10 game tiếng Anh** cho kênh dạy tiếng Anh: Đúng hay Sai, Unscramble, Dịch nhanh, Emoji Guess, Sentence Builder, Hangman, Name It!, English Quiz, Word Chain (EN), Ô chữ. Ngân hàng từ/câu hỏi sửa được ngay trong app (nhập được file .txt / .csv).
- **Nhạc nền game:** nhạc tự soạn trong app (không dùng bài có bản quyền, không lo TikTok tắt tiếng): Vui nhộn, Hồi hộp, Đối kháng, Nhẹ nhàng, nhạc chờ chọn game; tự chọn theo game, dồn dập hơn khi sắp hết giờ, tự nhường khi đang phát playlist.
- **Tính năng nền:** bảng xếp hạng fan (điểm từ comment/tim/gift), chào người follow / vào phòng kèm âm thanh.
- **Comment thử:** ô gửi comment từ viewer ngẫu nhiên để test game khi chưa LIVE.
- **Cửa sổ game điều khiển được:** bấm vào cửa sổ game → ☰ để về danh sách game giữa ván (điểm vẫn tính); bấm một game trong danh sách để chơi ngay.
- **✨ AI tạo câu hỏi (Gemini / Groq / Grok):** lưu API key trong panel 🤖 AI tạo câu hỏi, rồi bấm ✨ Tạo bằng AI ở bộ câu hỏi của bất kỳ game nào: nhập chủ đề, số dòng, độ khó → xem lại → thêm vào. Key được mã hoá trên máy. Hướng dẫn: [docs/AI.md](docs/AI.md).

## Yêu cầu

- Node.js >= 22.12 (xem [docs/BUILD.md](docs/BUILD.md#bước-1-cài-công-cụ-một-lần))
- npm
- macOS / Windows / Linux có thể chạy Electron

## Chạy development

```bash
npm install
npm run dev
```

Vite chạy renderer ở `127.0.0.1:5173`, script dev tự mở Electron.

## Build renderer + chạy desktop

```bash
npm run build
npm start
```

## Đóng gói app (macOS / Windows)

Hướng dẫn đầy đủ từng bước (cài Node, đóng gói, cài app, mở lần đầu, lỗi thường gặp): **[docs/BUILD.md](docs/BUILD.md)**.

| Lệnh | Kết quả trong `release/` |
|---|---|
| `npm run dist:mac` | `.dmg` + `.zip` cho Mac chip Apple (`arm64`) và Intel (`x64`). Chỉ chạy trên Mac. |
| `npm run dist:win` | Bộ cài `…-win-x64.exe` + bản chạy luôn `…-portable.exe`. Chạy trên Windows hoặc Mac. |
| `npm run dist` | Gói cho hệ điều hành đang dùng |

## Test nhanh không cần TikTok LIVE

Khi chưa kết nối TikTok, công cụ test tự hiện (khi đã kết nối thì ẩn, bấm **🧪 Hiện công cụ test** nếu cần):

- Panel **TikTok LIVE**: nút `!next`, comment 1–3 / A–D, like, gift, follow, vào phòng và ô **gửi comment thử** từ viewer ngẫu nhiên.
- Panel **Game**, khối **🧪 Test game**: sau khi bấm **Bắt đầu**, hiện nút riêng cho game đang chạy (vd “Trả lời đúng”, “Chữ sai: Z”, “Vào đội A”, “Nối đúng”).
- **🤖 Bot chơi thử**: nhóm 8 viewer ảo tự bấm các nút đó liên tục (Chậm / Vừa / Nhanh) để xem overlay chạy như LIVE thật.

Mọi event test đi qua đúng đường event thật: chống spam, rule nhạc, điểm và overlay.

## Giao diện

Tab **🎮 Game** đi theo 4 bước:

1. **① Kết nối TikTok**: nhập username đang LIVE → Kết nối (chưa LIVE vẫn thử được).
2. **② Chọn game**: bấm một thẻ (Giải trí / Đối kháng / Tiếng Anh / Tiếng Nhật / Tiếng Trung).
3. **③ Game đang chọn**: **▶ Bắt đầu**, **🤖 Chạy thử** (bot tự chơi), **⏹ Chốt**, **✕ Huỷ**; lệnh chat của game; bảng xếp hạng. Mục đóng sẵn: ⚙ Cài đặt game, 🧪 Test không cần LIVE.
4. **④ Đưa lên OBS**: chọn khung (9:16, 16:9, 1:1, 4:5 hoặc tự nhập), vị trí game (lưới 3×3), cỡ game (Nhỏ → Rất lớn), “Tránh vùng TikTok che”; xem trước; **🪟 Mở cửa sổ game** hoặc **📋 Copy link**.

Thanh trạng thái dưới tiêu đề luôn hiện thông báo mới nhất. Chữ quá nhỏ / quá to: bấm **A− / A+** trên header (mặc định 120%, được lưu lại). Giao diện co giãn theo cửa sổ (nhỏ nhất 420 px): cửa sổ rộng chia 2 cột; cửa sổ hẹp gom thành 1 cột với game đang chạy ngay dưới ô Kết nối TikTok, nên có thể đặt app cạnh OBS hoặc kéo nhỏ ra một góc màn hình. Ngôn ngữ: bấm **🇻🇳 VI / 🇬🇧 EN** trên header để đổi cả app lẫn overlay (bảng xếp hạng, gợi ý, thông báo trong game) sang tiếng Anh; lựa chọn được lưu lại. Nội dung câu hỏi là dữ liệu nên không tự dịch: game dùng bộ câu tiếng Việt vẫn hỏi bằng tiếng Việt (thay bằng file riêng trong ⚙ Cài đặt game nếu cần). **Cài đặt chung** (lệnh chat, điểm fan, chào người mới) và **Nhật ký LIVE** đóng sẵn ở cột phải.
Tab **🎵 Nhạc**: Music Player, Playlist, Rules nhạc (nhạc vẫn phát khi đang ở tab Game).

## Đưa game lên OBS

1. Chọn game, bấm **🤖 Chạy thử** để xem trước trong panel ④ (bot tự chơi, tự tắt khi hết vòng).
2. Chọn một trong hai cách:
   - **🪟 Mở cửa sổ game** → OBS **Window Capture** “Game Overlay”; nền xanh thì thêm filter **Chroma Key**.
   - Hoặc **Copy** link → OBS **Browser Source**, Width/Height đúng kích thước khung app ghi, nền trong suốt sẵn.
3. Lên LIVE: bấm **▶ Bắt đầu** hoặc gõ `!start` / `!start quiz` trong chat (tài khoản LIVE hoặc mod).
4. Âm thanh (nhạc, chuông chào): thêm **Application Audio Capture** cho app này trong OBS.

## Hiệu ứng & âm thanh

Overlay có màu riêng cho từng game, đồng hồ vòng tròn, huy hiệu tên viewer, huy chương 🥇🥈🥉, chữ cái dạng ô, quiz 4 màu, boss rung khi trúng đòn, kéo co, đường đua, số bay lên, băng rôn **Bắt đầu / Chiến thắng / Hết giờ** kèm pháo giấy. App phát âm thanh tương ứng (tắt ở Cài đặt chung → 🔊 Âm thanh game).

## Lệnh chat

- Mọi viewer: `!help`, `!rank`, và lệnh riêng của game (`!join`, `!join a`, `!run`, `!hit`, `!guess 42`, `!cut 3`, `!ans …`) — xem trên thẻ game.
- Streamer/mod: `!start`, `!start <tên game>`, `!stop`, `!cancel`, `!games`, `!spin`. Danh sách mod khai trong panel **Lệnh chat & tính năng nền**.

## Kiểm thử

```bash
npm test
```

Chi tiết: `docs/OVERLAY.md`.

## TikTok LIVE thật

Nhập username của account **đang LIVE**, ví dụ `@example`, rồi Connect. Comment thật sẽ hiện trong panel `LIVE Comments & Events` và được đưa qua Rule Engine trong React.

`tiktok-live-connector` là thư viện không chính thức/reverse-engineered. TikTok thay đổi Webcast có thể khiến một số event tạm thời không hoạt động.

## Security

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- Renderer không nhận filesystem path thật của file nhạc; Electron main cấp URL `media://` theo token.
- Comment chỉ được match với các rule đã định nghĩa, không được đưa vào shell/`exec`.
- Overlay server chỉ nghe `127.0.0.1`, kiểm tra `Host`, chỉ phục vụ đường dẫn whitelist và chỉ nhận dữ liệu hiển thị công khai.

Xem thêm `docs/ARCHITECTURE.md`, `docs/RULES.md`, `AGENTS.md`.
