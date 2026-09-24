# Hướng dẫn build & đóng gói app (macOS / Windows)

Tài liệu này đi từ máy trắng đến file cài đặt gửi cho người khác. Làm lần lượt từng bước; mỗi bước có lệnh cho **macOS** và **Windows**.

| Bạn muốn… | Xem |
|---|---|
| Chạy app để phát triển / thử | [Bước 1–3](#bước-1-cài-công-cụ-một-lần) |
| Tạo file cài cho Mac | [Bước 4A](#4a-đóng-gói-cho-macos) |
| Tạo file cài cho Windows | [Bước 4B](#4b-đóng-gói-cho-windows) |
| Cài app / mở lần đầu | [Bước 5](#bước-5-cài-và-mở-app) |
| Gặp lỗi | [Lỗi thường gặp](#lỗi-thường-gặp) |

---

## Bước 1: Cài công cụ (một lần)

Chỉ cần **Node.js 22** (có sẵn npm). Không cần Xcode, Visual Studio hay Python: app không có module native.

**macOS**

1. Tải bản **Node.js 22 LTS** tại <https://nodejs.org> (file `.pkg`) và cài như app bình thường.
2. Mở **Terminal**, kiểm tra:

```bash
node -v
```

Kết quả phải là `v22.12.0` trở lên (ví dụ `v22.14.0`). Nếu ra `v20…` hay `v18…`, cài lại Node 22.

**Windows**

1. Tải bản **Node.js 22 LTS** tại <https://nodejs.org> (file `.msi`), cài với tuỳ chọn mặc định.
2. Mở **Command Prompt** (gõ `cmd` trong Start), kiểm tra:

```bat
node -v
```

> Dùng **Command Prompt** cho các lệnh bên dưới. PowerShell trên một số máy chặn `npm` với lỗi *"running scripts is disabled"* (xem [Lỗi thường gặp](#lỗi-thường-gặp)).

## Bước 2: Lấy mã nguồn và cài thư viện

Chép thư mục dự án về máy (hoặc `git clone`), rồi mở Terminal / Command Prompt **trong thư mục dự án**:

**macOS**

```bash
cd ~/Projects/tiktok-live-music-electron-tsx-final
npm install
```

**Windows**

```bat
cd C:\Projects\tiktok-live-music-electron-tsx-final
npm install
```

`npm install` tải khoảng 500 MB vào `node_modules/`, mất 1–3 phút. Kết thúc bằng dòng `found 0 vulnerabilities` (hoặc tương tự) là được. Chỉ cần chạy lại khi `package.json` thay đổi.

## Bước 3: Chạy thử (development)

```bash
npm run dev
```

Lệnh giống nhau trên cả hai hệ điều hành. Cửa sổ app tự mở sau vài giây; sửa code trong `src/` là giao diện tự cập nhật. Tắt bằng **Ctrl + C** trong Terminal / Command Prompt.

Kiểm tra trước khi đóng gói (nên làm mỗi lần):

```bash
npm test
npm run build
```

- `npm test`: chạy toàn bộ test, cuối cùng phải là `fail 0`.
- `npm run build`: kiểm tra kiểu TypeScript và build ra `dist/` + `dist-electron/`. Không có dòng `error` là được.
- Muốn chạy bản vừa build (không cần Vite): `npm start`.

## Bước 4: Đóng gói ra file cài đặt

File kết quả nằm trong thư mục **`release/`** của dự án. Mỗi lệnh đã tự chạy `npm run build` trước, không cần chạy riêng.

Lần đầu đóng gói, electron-builder tải Electron và công cụ đóng gói (~100–200 MB) nên sẽ lâu hơn; các lần sau dùng lại bản đã tải.

### 4A. Đóng gói cho macOS

Chỉ làm được **trên máy Mac**.

```bash
npm run dist:mac
```

Mất khoảng 1–2 phút. Kết quả:

| File | Dùng cho |
|---|---|
| `TikLiveVPN-<version>-mac-arm64.dmg` | Mac chip Apple (M1, M2, M3, M4…) |
| `TikLiveVPN-<version>-mac-x64.dmg` | Mac chip Intel |
| `…-mac-arm64.zip`, `…-mac-x64.zip` | Như trên, dạng nén (giải nén là có app) |

Không biết Mac dùng chip gì: menu  → **About This Mac** → dòng **Chip** (Apple M…) hay **Processor** (Intel).

### 4B. Đóng gói cho Windows

Làm được **trên Windows hoặc trên Mac** (không cần Wine).

```bash
npm run dist:win
```

Kết quả:

| File | Dùng khi |
|---|---|
| `TikLiveVPN-<version>-win-x64.exe` | **Bộ cài**: có shortcut ở Start Menu / Desktop, cho chọn thư mục cài, gỡ được trong Settings → Apps. Nên dùng bản này. |
| `TikLiveVPN-<version>-portable.exe` | **Bản chạy luôn**: không cần cài, bấm đúp là mở. Tiện để chép USB hoặc dùng thử. Lần mở đầu hơi chậm vì phải tự giải nén. |

Cả hai chạy trên Windows 10/11 64-bit.

### Đóng gói cho máy đang dùng

```bash
npm run dist
```

Trên Mac tạo gói Mac, trên Windows tạo gói Windows.

### Gửi file cho người khác

Chỉ gửi file `.dmg` / `.zip` (Mac) hoặc `.exe` (Windows). **Không** cần gửi các file `.blockmap`, `builder-debug.yml` hay thư mục `mac/`, `mac-arm64/`, `win-unpacked/` (đó là bản chưa nén để kiểm tra).

## Bước 5: Cài và mở app

App **chưa được ký bằng chứng chỉ trả phí** (Apple Developer ID / chứng chỉ Windows), nên lần mở đầu hệ điều hành sẽ cảnh báo. Đây là bình thường với app tự build; làm như sau một lần là xong.

### macOS

1. Mở file `.dmg`, kéo **TikLiveVPN** vào thư mục **Applications**.
2. Mở app lần đầu. macOS báo *"Apple could not verify…"* hoặc *"cannot be opened"* → bấm **Done / OK**.
3. Vào **System Settings → Privacy & Security**, kéo xuống mục **Security**, bấm **Open Anyway** cạnh tên app, xác nhận bằng mật khẩu / Touch ID.
4. Từ lần sau mở bình thường.

Trên macOS 14 trở về trước có thể làm nhanh hơn: **chuột phải vào app → Open → Open**.

Nếu macOS báo app **"is damaged and can't be opened"** (hay gặp khi tải file qua trình duyệt / Zalo / Telegram), mở Terminal và chạy:

```bash
xattr -dr com.apple.quarantine "/Applications/TikLiveVPN.app"
```

Lệnh này chỉ gỡ dấu "tải từ Internet" của đúng app này, rồi mở lại như bước 3.

### Windows

1. Bấm đúp file `.exe`.
2. Nếu hiện màn hình xanh **"Windows protected your PC"** (SmartScreen): bấm **More info** → **Run anyway**.
3. Bộ cài: chọn cài cho mình / mọi người dùng, chọn thư mục → **Install**. Sau đó mở app từ Start Menu hoặc Desktop.

Gỡ app: **Settings → Apps → Installed apps → TikLiveVPN → Uninstall**. Bản portable thì chỉ cần xoá file `.exe`.

### Dữ liệu của app

Cài đặt (game đã chọn, nhóm game, ngôn ngữ, cỡ chữ…) được lưu riêng cho từng máy, giữ nguyên khi cài bản mới (bản chạy bằng `npm run dev` dùng chung thư mục này):

- macOS: `~/Library/Application Support/tiktok-live-music-electron/`
- Windows: `%APPDATA%\tiktok-live-music-electron\`

Xoá thư mục này = đưa app về cài đặt gốc. Tên thư mục lấy từ `name` trong `package.json` (không phải tên hiển thị), nên đổi tên app không làm mất cài đặt cũ.

## Phát hành bản mới

1. Tăng số phiên bản trong `package.json`, dòng `"version": "1.1.0"` → ví dụ `"1.2.0"`. Tên file cài lấy theo số này.
2. Chạy kiểm tra: `npm test` và `npm run build`.
3. Xoá kết quả cũ cho khỏi lẫn: xoá thư mục `release/`.
4. Đóng gói: `npm run dist:mac` và/hoặc `npm run dist:win`.
5. Cài thử bản mới trên máy thật (Mac và Windows), kết nối thử một phòng LIVE hoặc bấm **🤖 Chạy thử**, mở **🪟 Cửa sổ game** / link overlay trong OBS.
6. Gửi file cho người dùng.

## Tuỳ chỉnh gói

Mọi cấu hình đóng gói nằm trong **`electron-builder.yml`**:

| Muốn đổi | Sửa |
|---|---|
| Tên app hiển thị (hiện là **TikLiveVPN**) | `productName` trong `electron-builder.yml`; tên trong app: `<title>` ở `index.html`, `<h1>` ở `src/App.tsx`, `title` cửa sổ ở `electron/main.ts` |
| Tên file cài | `artifactName` |
| Chỉ build Mac chip Apple (nhanh hơn) | `mac.target[*].arch` → `[arm64]` |
| Bỏ bản portable Windows | xoá mục `- target: portable` |
| Thư mục kết quả | `directories.output` |

**Icon app:** nằm trong thư mục `build/`, electron-builder tự dùng:

| File | Dùng cho |
|---|---|
| `build/icon.svg` | **File gốc**: sửa hình ở đây |
| `build/icon.icns` | Icon Mac (Dock, Finder, Launchpad) |
| `build/icon.ico` | Icon Windows (file .exe, Start Menu, taskbar), cỡ 16–256 px |
| `build/icon.png` | Ảnh 1024×1024; cũng là icon khi chạy `npm run dev` |

Sửa `build/icon.svg` (bằng Figma, Inkscape hay trình soạn thảo) rồi tạo lại các file còn lại:

```bash
npm run icons
```

Chạy trên Mac để tạo đủ cả `.icns`; trên Windows lệnh chỉ tạo `.png` và `.ico`, giữ nguyên `.icns` cũ. Muốn dùng ảnh có sẵn thay cho SVG: thay thẳng 3 file `icon.icns`, `icon.ico`, `icon.png` (ảnh gốc nên là PNG vuông 1024×1024).

**Ký app (tuỳ chọn, tốn phí):** muốn bỏ hẳn cảnh báo ở Bước 5 cần Apple Developer ID (99 USD/năm, kèm notarize) cho Mac và chứng chỉ code signing cho Windows. Xem <https://www.electron.build/code-signing>.

## Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `npm error ERESOLVE unable to resolve dependency tree` | Dùng `package.json` / `package-lock.json` mới nhất của dự án, xoá thư mục `node_modules` rồi chạy lại `npm install`. |
| `The engine "node" is incompatible` hoặc lỗi cú pháp lạ khi build | Node quá cũ. Chạy `node -v`, cần ≥ 22.12 (Bước 1). |
| Windows PowerShell: *"npm.ps1 cannot be loaded because running scripts is disabled"* | Dùng **Command Prompt** thay cho PowerShell (hoặc gõ `npm.cmd` thay cho `npm`). |
| `spawn EINVAL` khi `npm run dev` trên Windows | Mã nguồn cũ; bản hiện tại đã sửa trong `scripts/dev.ts`. Cập nhật mã nguồn. |
| `Port 5173 is already in use` khi `npm run dev` | Đang có một `npm run dev` khác chạy. Tắt nó (Ctrl + C) hoặc đóng Terminal cũ. |
| App báo **cổng 17321 đang bị dùng**, overlay không lên | Đang mở 2 app cùng lúc (ví dụ bản dev và bản đã cài). Tắt một bản; app tự thử lại khi cổng trống. |
| `npm run dist:mac` trên Windows báo lỗi | Bình thường: gói Mac chỉ build được trên Mac. |
| Đóng gói treo / lỗi khi **downloading electron** | Mạng chặn GitHub. Thử mạng khác, hoặc đặt mirror rồi chạy lại: macOS `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`, Windows `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`. |
| Mac: *"is damaged and can't be opened"* | Chạy lệnh `xattr` ở [Bước 5](#macos). |
| Windows: *"Windows protected your PC"* | **More info → Run anyway** ([Bước 5](#windows)). |
| Antivirus báo nhầm bản portable | Bản portable tự giải nén nên đôi khi bị nghi ngờ; dùng bộ cài `…-win-x64.exe` thay thế. |

## Tóm tắt lệnh

| Lệnh | Làm gì | Chạy trên |
|---|---|---|
| `npm install` | Cài thư viện | Mac, Windows |
| `npm run dev` | Chạy app khi phát triển | Mac, Windows |
| `npm test` | Chạy test | Mac, Windows |
| `npm run build` | Kiểm tra TypeScript + build JS | Mac, Windows |
| `npm start` | Chạy bản đã build | Mac, Windows |
| `npm run dist:mac` | Tạo `.dmg` + `.zip` (arm64, x64) | Chỉ Mac |
| `npm run dist:win` | Tạo bộ cài + bản portable `.exe` | Mac, Windows |
| `npm run dist` | Đóng gói cho máy đang dùng | Mac, Windows |
| `npm run icons` | Tạo lại icon từ `build/icon.svg` | Mac (đủ), Windows (trừ `.icns`) |
