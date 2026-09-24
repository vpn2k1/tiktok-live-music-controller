# AI tạo câu hỏi (Gemini / Groq / Grok)

App có thể dùng AI để viết thêm câu hỏi, đáp án, từ vựng… cho **mọi game có bộ câu hỏi** (Quiz, Rung chuông vàng, Đúng hay Sai, Hangman, Ô chữ, Đuổi hình bắt chữ, game tiếng Anh / Nhật / Trung, Vòng quay thử thách, Thử thách tim…). AI viết đúng định dạng của từng game; app tự lọc dòng sai mẫu và bạn xem lại trước khi thêm.

## 1. Lấy API key (miễn phí)

Chọn **một** nhà cung cấp (có thể lưu cả ba):

| Nhà cung cấp | Tạo key tại | Ghi chú |
|---|---|---|
| **Google Gemini** | <https://aistudio.google.com/apikey> | Đăng nhập Google → **Create API key**. Có hạn mức miễn phí, tiếng Việt tốt. Nên dùng. |
| **Groq** | <https://console.groq.com/keys> | Rất nhanh, có hạn mức miễn phí. Key bắt đầu bằng `gsk_`. |
| **Grok (xAI)** | <https://console.x.ai> | Cần nạp credit trên tài khoản xAI. |

Giữ key như mật khẩu: không đăng lên mạng, không gửi trong nhóm chat.

## 2. Lưu key trong app

1. Tab **🎮 Game**, cột phải: panel **🤖 AI tạo câu hỏi**.
2. Bấm tên nhà cung cấp (**Google Gemini / Groq / Grok (xAI)**). Nhà cung cấp đang chọn là nhà cung cấp dùng để tạo câu hỏi.
3. Dán key vào ô **Dán API key vào đây** → **💾 Lưu key**. App lưu rồi tự kết nối thử:
   - *"Đã lưu key và kết nối thử thành công."* → dùng được.
   - Báo lỗi → xem [Lỗi thường gặp](#5-lỗi-thường-gặp).
4. Sau khi lưu, app chỉ hiện 4 ký tự cuối (vd `…a1b2`). Muốn đổi key: dán key mới rồi Lưu; muốn bỏ: **🗑 Xoá key**.

**Model:** để mặc định (`gemini-2.5-flash`, `llama-3.3-70b-versatile`, `grok-3-mini`). Chỉ đổi khi nhà cung cấp báo model cũ ngừng hoạt động: gõ tên model mới (lấy trong trang tài liệu của nhà cung cấp) rồi Enter; xoá trắng ô = về mặc định.

## 3. Tạo câu hỏi cho một game

1. Chọn game (vd **Quiz A/B/C/D**) → mở **⚙ Cài đặt game**.
2. Ở ô bộ câu hỏi, bấm **✨ Tạo bằng AI**.
3. Điền:
   - **Chủ đề**: vd `động vật`, `lịch sử Việt Nam`, `từ vựng nhà bếp`, `HSK 2`… (để trống = đa dạng).
   - **Số dòng**: 1–50 (nhiều dòng thì AI chạy lâu hơn).
   - **Độ khó**: Dễ / Vừa / Khó.
   - **Ngôn ngữ nội dung**: *Theo mẫu của game* (khuyên dùng), Tiếng Việt hoặc Tiếng Anh.
4. Bấm **✨ Tạo** (thường 5–30 giây).
5. Xem kết quả trong khung: sửa trực tiếp nếu cần. Dòng báo *"✅ N dòng dùng được"* đếm theo đúng bộ kiểm tra của game; dòng trùng với bộ hiện có hoặc sai mẫu đã bị bỏ.
6. Bấm **➕ Thêm vào cuối** (giữ câu cũ) hoặc **🔁 Thay toàn bộ**. Chưa ưng thì **🔄 Tạo lại** hoặc đổi chủ đề.

Nút **✨ Tạo bằng AI** bị mờ khi game đang chạy (không sửa bộ câu hỏi giữa ván).

> **Luôn đọc lại trước khi LIVE.** AI có thể sai kiến thức hoặc đáp án. Với game dạy ngoại ngữ, kiểm tra chính tả / dấu thanh / kana.

## 4. Bảo mật & quyền riêng tư

- Key được **mã hoá bằng hệ điều hành** (Keychain trên macOS, DPAPI trên Windows) và lưu trong thư mục dữ liệu của app (`ai-settings.json`). Phần giao diện không đọc lại được key.
- Nếu máy không hỗ trợ mã hoá (một số Linux), app báo và chỉ giữ key đến khi tắt app.
- Mỗi lần tạo, app gửi tới nhà cung cấp: tên + cách chơi của game, **định dạng mẫu** của bộ câu hỏi, chủ đề, số dòng, độ khó và tối đa 60 mục đầu của bộ hiện có (để tránh trùng). **Không** gửi comment, tên viewer hay dữ liệu TikTok.
- App chỉ gọi đúng 3 địa chỉ: `generativelanguage.googleapis.com`, `api.groq.com`, `api.x.ai`.
- Kết quả AI chỉ được dùng làm dữ liệu câu hỏi (qua bộ kiểm tra của game), không bao giờ được chạy như lệnh.
- Xoá hẳn key: **🗑 Xoá key**, hoặc xoá file `ai-settings.json` trong thư mục dữ liệu (xem `docs/BUILD.md` → *Dữ liệu của app*).

## 5. Lỗi thường gặp

| Thông báo | Cách xử lý |
|---|---|
| *API key sai, hết hạn hoặc không có quyền dùng model này* | Tạo key mới, dán lại (đúng nhà cung cấp). Với Grok: kiểm tra tài khoản xAI còn credit. |
| *Hết lượt miễn phí / vượt giới hạn* | Đợi vài phút (hạn mức tính theo phút/ngày), tạo ít dòng hơn, hoặc chuyển sang nhà cung cấp khác. |
| *Yêu cầu không hợp lệ (kiểm tra tên model)* | Xoá trắng ô **Model** để về mặc định; nếu vẫn lỗi, model mặc định đã bị ngừng: gõ model mới theo tài liệu của nhà cung cấp. |
| *Không kết nối được tới nhà cung cấp AI* | Kiểm tra mạng / VPN / tường lửa công ty. |
| *AI trả lời quá lâu* | Giảm **Số dòng** (vd 10–20). |
| *AI trả về N dòng nhưng không dòng nào đúng mẫu* | Bấm **🔄 Tạo lại**, đổi chủ đề cụ thể hơn, hoặc chọn *Ngôn ngữ nội dung: Theo mẫu của game*. |
| *Key không đúng định dạng* | Dán lại cả key (không thiếu ký tự), không kèm chữ khác. |
