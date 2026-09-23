# TikTok LIVE Game Controller — React + Electron

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
- **9 game giải trí:** Vote bài, Đánh boss, Nối chữ, Quiz A/B/C/D, Đoán số, Ai nhanh tay, Team battle, Đua vịt, Vòng quay thử thách.
- **8 game tiếng Anh** cho kênh dạy tiếng Anh: Unscramble, Dịch nhanh, Emoji Guess, Sentence Builder, Hangman, Name It!, English Quiz, Word Chain (EN). Ngân hàng từ/câu hỏi sửa được ngay trong app.
- **Tính năng nền:** bảng xếp hạng fan (điểm từ comment/tim/gift), chào người follow / vào phòng kèm âm thanh.
- **Comment thử:** ô gửi comment từ viewer ngẫu nhiên để test game khi chưa LIVE.

## Yêu cầu

- Node.js >= 22.12
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

## Test nhanh không cần TikTok LIVE

Khi chưa kết nối TikTok, công cụ test tự hiện (khi đã kết nối thì ẩn, bấm **🧪 Hiện công cụ test** nếu cần):

- Panel **TikTok LIVE**: nút `!next`, comment 1–3 / A–D, like, gift, follow, vào phòng và ô **gửi comment thử** từ viewer ngẫu nhiên.
- Panel **Game**, khối **🧪 Test game**: sau khi bấm **Bắt đầu**, hiện nút riêng cho game đang chạy (vd “Trả lời đúng”, “Chữ sai: Z”, “Vào đội A”, “Nối đúng”).
- **🤖 Bot chơi thử**: nhóm 8 viewer ảo tự bấm các nút đó liên tục (Chậm / Vừa / Nhanh) để xem overlay chạy như LIVE thật.

Mọi event test đi qua đúng đường event thật: chống spam, rule nhạc, điểm và overlay.

## Giao diện

Tab **🎮 Game** đi theo 4 bước:

1. **① Kết nối TikTok**: nhập username đang LIVE → Kết nối (chưa LIVE vẫn thử được).
2. **② Chọn game**: bấm một thẻ (Giải trí / Tiếng Anh).
3. **③ Game đang chọn**: **▶ Bắt đầu**, **🤖 Chạy thử** (bot tự chơi), **⏹ Chốt**, **✕ Huỷ**; lệnh chat của game; bảng xếp hạng. Mục đóng sẵn: ⚙ Cài đặt game, 🧪 Test không cần LIVE.
4. **④ Đưa lên OBS**: chọn khung (9:16, 16:9, 1:1, 4:5 hoặc tự nhập), vị trí game (lưới 3×3), cỡ game (Nhỏ → Rất lớn), “Tránh vùng TikTok che”; xem trước; **🪟 Mở cửa sổ game** hoặc **📋 Copy link**.

Thanh trạng thái dưới tiêu đề luôn hiện thông báo mới nhất. Chữ quá nhỏ / quá to: bấm **A− / A+** trên header (mặc định 120%, được lưu lại). **Cài đặt chung** (lệnh chat, điểm fan, chào người mới) và **Nhật ký LIVE** đóng sẵn ở cột phải.
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

- Mọi viewer: `!help`, `!rank`, và lệnh riêng của game (`!join`, `!join a`, `!run`, `!hit`, `!guess 42`, `!vote 2`, `!ans …`) — xem trên thẻ game.
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
