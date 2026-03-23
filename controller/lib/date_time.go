package lib

import (
	"time"
)

// EnsureUTCAware nhận vào một con trỏ thời gian.
// Nếu nil, trả về nil.
// Nếu có giá trị, nó sẽ chuyển đổi múi giờ về UTC (nếu chưa phải UTC).
func ensure_utc_aware(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}

	// Đảm bảo thời gian này sử dụng múi giờ UTC.
	// Hàm .UTC() quy đổi thời gian thực tế (ví dụ: 12h00 VN (+7) -> 05h00 UTC).
	// Nếu t vốn dĩ đã là UTC, hàm này không làm thay đổi giá trị.
	utcTime := t.UTC()

	return &utcTime
}
