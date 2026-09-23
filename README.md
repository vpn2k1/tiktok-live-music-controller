# TikTok LIVE Music Controller — React + Electron

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

1. Add music và chọn tối thiểu 2 file.
2. Bật Play.
3. Dùng các nút Test: `!next`, `comment 2`, `+25 likes`, `Rose ×5`.
4. Bật rule Likes/Gift nếu muốn test threshold.

## TikTok LIVE thật

Nhập username của account **đang LIVE**, ví dụ `@example`, rồi Connect. Comment thật sẽ hiện trong panel `LIVE Comments & Events` và được đưa qua Rule Engine trong React.

`tiktok-live-connector` là thư viện không chính thức/reverse-engineered. TikTok thay đổi Webcast có thể khiến một số event tạm thời không hoạt động.

## Security

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- Renderer không nhận filesystem path thật của file nhạc; Electron main cấp URL `media://` theo token.
- Comment chỉ được match với các rule đã định nghĩa, không được đưa vào shell/`exec`.

Xem thêm `docs/ARCHITECTURE.md`, `docs/RULES.md`, `AGENTS.md`.
