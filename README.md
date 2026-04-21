# gasoline_prices 


Các tính năng filter cho bảng dữ liệu
1. Filter theo cột cụ thể
UID: tìm nhanh theo số UID, hỗ trợ tìm chính xác hoặc bắt đầu bằng.
Mã NV: filter theo mã nhân viên, có thể dùng contains để tìm mã một phần.
Họ tên: gõ tên hoặc một phần tên, matching case-insensitive.
Vai trò: chọn filter Admin / User / Tất cả.
Số thẻ: lọc theo số thẻ tồn tại / không tồn tại, hoặc số thẻ cụ thể.

2. Filter dạng summary + dropdown
Cột Vai trò có thể thêm dropdown chọn sẵn.
Cột Số thẻ có thể thêm trạng thái Có thẻ / Không có thẻ.
Cột UID và Mã NV có thể dùng input nhỏ trong header.

3. UI lọc thông minh
Search chung ở đầu bảng với placeholder “Tìm UID, mã NV, tên…”
Khi filter theo cột, hiện badge nhỏ phía trên bảng: Vai trò=Admin, Chứa=270
Nút Xóa filter / Reset để quay về view đầy đủ.

4. Filter mở rộng
Date filter cho những bảng có ngày sync / created_at.
Multi-select cho cột có nhóm giá trị cố định.
Filter theo trạng thái dữ liệu (ví dụ: nhân viên chưa đồng bộ).

5. Tối ưu UX
Filter áp dụng ngay khi gõ, không cần submit.
Giữ filter khi chuyển trang hoặc reload trong cùng session.
Hiển thị số bản ghi đang lọc: Hiện 12/85 nhân viên.
Kết luận
Với bảng nhân viên hiện tại, nên ưu tiên:

Input tìm kiếm chung
Dropdown filter cho Vai trò
Filter theo Số thẻ (có/không)
Reset filter nhanh
Nếu muốn, tôi có thể đề xuất thêm cấu trúc UI cụ thể và cách triển khai trong
