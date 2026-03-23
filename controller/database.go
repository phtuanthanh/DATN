package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrDBData = errors.New("game control information has not been configured")

// ControlInfo lưu trữ thông tin cấu hình trò chơi
type ControlInfo struct {
	Start        time.Time
	End          time.Time
	TickDuration int
	CurrentTick  int
}

// DBTX là interface cho phép truyền vào cả *sql.DB hoặc *sql.Tx.
// Điều này giúp hàm linh hoạt: có thể chạy độc lập hoặc nằm trong một transaction lớn hơn.
type DBTX interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// GetControlInfo lấy trạng thái hiện tại của game
func GetControlInfo(ctx context.Context, db DBTX) (*ControlInfo, error) {
	query := `SELECT start, "end", tick_duration, current_tick FROM scoring_gamecontrol LIMIT 1`

	var info ControlInfo
	var start, end sql.NullTime

	err := db.QueryRowContext(ctx, query).Scan(&start, &end, &info.TickDuration, &info.CurrentTick)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrDBData
		}
		return nil, fmt.Errorf("failed to get control info: %w", err)
	}

	// Đảm bảo UTC giống hàm ensure_utc_aware()
	if start.Valid {
		info.Start = start.Time.UTC()
	}
	if end.Valid {
		info.End = end.Time.UTC()
	}

	return &info, nil
}

// IncreaseTick tăng tick hiện tại lên 1 và tạo flag mới cho mọi dịch vụ/đội
func IncreaseTick(ctx context.Context, db DBTX) error {
	updateQuery := `
		UPDATE scoring_gamecontrol 
		SET current_tick = current_tick + 1, cancel_checks = false
	`
	if _, err := db.ExecContext(ctx, updateQuery); err != nil {
		return fmt.Errorf("failed to update tick: %w", err)
	}

	insertQuery := `
		INSERT INTO scoring_flag (service_id, protecting_team_id, tick)
		SELECT service.id, team.user_id, control.current_tick
		FROM scoring_service service, auth_user, registration_team team, scoring_gamecontrol control
		WHERE auth_user.id = team.user_id AND auth_user.is_active = true
	`
	if _, err := db.ExecContext(ctx, insertQuery); err != nil {
		return fmt.Errorf("failed to insert new flags: %w", err)
	}

	return nil
}

// CancelChecks hủy các đợt kiểm tra
func CancelChecks(ctx context.Context, db DBTX) error {
	query := `UPDATE scoring_gamecontrol SET cancel_checks = true`
	if _, err := db.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("failed to cancel checks: %w", err)
	}
	return nil
}

// GetExploitingTeamsCounts đếm số đội tấn công thành công cho mỗi dịch vụ
func GetExploitingTeamsCounts(ctx context.Context, db DBTX) (map[string]int, error) {
	query := `
		SELECT service.slug, COUNT(DISTINCT capture.capturing_team_id)
		FROM scoring_service service
		JOIN scoring_flag flag ON flag.service_id = service.id
		LEFT JOIN scoring_capture capture ON capture.flag_id = flag.id
		GROUP BY service.slug
	`
	return fetchCounts(ctx, db, query)
}

// GetUnplacedFlagsCountsCur đếm số flag chưa được đặt của tick HIỆN TẠI
func GetUnplacedFlagsCountsCur(ctx context.Context, db DBTX) (map[string]int, error) {
	condition := "flag.tick = (SELECT current_tick FROM scoring_gamecontrol) AND flag.placement_start IS NULL"
	return getFlagsCounts(ctx, db, condition)
}

// GetUnplacedFlagsCountsOld đếm số flag chưa được đặt của các tick CŨ
func GetUnplacedFlagsCountsOld(ctx context.Context, db DBTX) (map[string]int, error) {
	condition := "flag.tick != (SELECT current_tick FROM scoring_gamecontrol) AND flag.placement_start IS NULL"
	return getFlagsCounts(ctx, db, condition)
}

// GetIncompleteFlagsCountsCur đếm số flag đặt dở dang của tick HIỆN TẠI
func GetIncompleteFlagsCountsCur(ctx context.Context, db DBTX) (map[string]int, error) {
	condition := "flag.tick = (SELECT current_tick FROM scoring_gamecontrol) AND flag.placement_start IS NOT NULL AND flag.placement_end IS NULL"
	return getFlagsCounts(ctx, db, condition)
}

// GetIncompleteFlagsCountsOld đếm số flag đặt dở dang của các tick CŨ
func GetIncompleteFlagsCountsOld(ctx context.Context, db DBTX) (map[string]int, error) {
	condition := "flag.tick != (SELECT current_tick FROM scoring_gamecontrol) AND flag.placement_start IS NOT NULL AND flag.placement_end IS NULL"
	return getFlagsCounts(ctx, db, condition)
}

// getFlagsCounts là hàm helper nội bộ (tương đương _get_flags_counts)
func getFlagsCounts(ctx context.Context, db DBTX, condition string) (map[string]int, error) {
	// Thay vì dùng subquery (SELECT * FROM scoring_flag WHERE...) như Python,
	// mình gộp điều kiện trực tiếp vào phép LEFT JOIN để tăng hiệu năng Database.
	query := fmt.Sprintf(`
		SELECT service.slug, COUNT(flag.id)
		FROM scoring_service service
		LEFT JOIN scoring_flag flag ON flag.service_id = service.id AND %s
		GROUP BY service.slug
	`, condition)

	return fetchCounts(ctx, db, query)
}

// fetchCounts là helper thực thi truy vấn và trả về map (tương đương dictionary)
func fetchCounts(ctx context.Context, db DBTX, query string) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var slug string
		var count int
		if err := rows.Scan(&slug, &count); err != nil {
			return nil, fmt.Errorf("row scan failed: %w", err)
		}
		counts[slug] = count
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return counts, nil
}
