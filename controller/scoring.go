package main

import (
	"context"
	"controller/lib"
	"fmt"
	"math"
	"strings"
)

type scoreRow struct {
	teamID, serviceID           int
	attack, defense, sla, total float64
}

// CalculateScoreboard tính toán toàn bộ bảng xếp hạng và lưu vào database
func CalculateScoreboard(ctx context.Context, db DBTX) error {
	// Các Map lồng nhau: map[teamID]map[serviceID]score
	teamAttack := make(map[int]map[int]float64)
	teamDefense := make(map[int]map[int]float64)
	teamSLA := make(map[int]map[int]float64)

	// Đếm số lần một flag bị capture: map[flagID]count
	flagCaptureCounts := make(map[int]float64)

	// Lấy danh sách NOP teams
	nopTeamIDs, err := getNOPTeamIDs(ctx, db)
	if err != nil {
		return fmt.Errorf("failed to get NOP teams: %w", err)
	}

	// Lấy dữ liệu Captures
	type capture struct {
		serviceID        int
		capturingTeamID  int
		protectingTeamID int
		flagID           int
	}
	var captures []capture
	rowsCap, err := db.QueryContext(ctx, `
		SELECT f.service_id, c.capturing_team_id, f.protecting_team_id, f.id
		FROM scoring_capture c JOIN scoring_flag f ON c.flag_id = f.id
	`)
	if err != nil {
		return err
	}
	defer rowsCap.Close()

	for rowsCap.Next() {
		var c capture
		if err := rowsCap.Scan(&c.serviceID, &c.capturingTeamID, &c.protectingTeamID, &c.flagID); err != nil {
			return err
		}
		if !nopTeamIDs[c.capturingTeamID] {
			captures = append(captures, c)
		}
	}

	// Lấy dữ liệu Flags
	type flagData struct {
		id               int
		serviceID        int
		protectingTeamID int
	}
	var flags []flagData
	serviceIDs := make(map[int]bool)
	teamIDs := make(map[int]bool)

	rowsFlag, err := db.QueryContext(ctx, `SELECT id, service_id, protecting_team_id FROM scoring_flag`)
	if err != nil {
		return err
	}
	defer rowsFlag.Close()

	for rowsFlag.Next() {
		var f flagData
		if err := rowsFlag.Scan(&f.id, &f.serviceID, &f.protectingTeamID); err != nil {
			return err
		}
		if !nopTeamIDs[f.protectingTeamID] {
			flags = append(flags, f)
			serviceIDs[f.serviceID] = true
			teamIDs[f.protectingTeamID] = true
		}
	}

	// Khởi tạo trước các giá trị (Pre-fill dicts)
	for tID := range teamIDs {
		teamAttack[tID] = make(map[int]float64)
		teamDefense[tID] = make(map[int]float64)
		teamSLA[tID] = make(map[int]float64)

		for sID := range serviceIDs {
			teamAttack[tID][sID] = 0.0
			teamDefense[tID][sID] = 0.0
			teamSLA[tID][sID] = 0.0
		}
	}

	// Tính điểm Attack
	for _, c := range captures {
		flagCaptureCounts[c.flagID]++
		teamAttack[c.capturingTeamID][c.serviceID] += 1.0
	}
	for _, c := range captures {
		teamAttack[c.capturingTeamID][c.serviceID] += 1.0 / flagCaptureCounts[c.flagID]
	}

	// Tính điểm Defense
	for _, f := range flags {
		count := flagCaptureCounts[f.id]
		teamDefense[f.protectingTeamID][f.serviceID] -= math.Pow(count, 0.75)
	}

	// Tính điểm SLA
	var teamCount int
	err = db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM registration_team t JOIN auth_user u ON t.user_id = u.id 
		WHERE u.is_active = true AND t.nop_team = false
	`).Scan(&teamCount)
	if err != nil {
		return err
	}

	slaFactor := math.Sqrt(float64(teamCount))

	// Helper để xử lý các câu lệnh check status
	processChecks := func(status int, multiplier float64) error {
		query := `
			SELECT team_id, service_id, COUNT(*) FROM scoring_statuscheck
			WHERE status = $1 GROUP BY team_id, service_id
		`
		rows, err := db.QueryContext(ctx, query, status)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var tID, sID, tickCount int
			if err := rows.Scan(&tID, &sID, &tickCount); err != nil {
				return err
			}
			if !nopTeamIDs[tID] {
				teamSLA[tID][sID] += float64(tickCount) * multiplier
			}
		}
		return nil
	}

	if err := processChecks(int(lib.OK), 1.0); err != nil {
		return err
	}
	if err := processChecks(int(lib.Recovering), 0.5); err != nil {
		return err
	}

	// Nhân SLA factor và tính Total Score
	var rowValues []scoreRow

	for tID, serviceSLA := range teamSLA {
		for sID := range serviceSLA {
			// Nhân factor cho SLA
			teamSLA[tID][sID] *= slaFactor

			attack := teamAttack[tID][sID]
			defense := teamDefense[tID][sID]
			sla := teamSLA[tID][sID]
			total := attack + defense + sla

			rowValues = append(rowValues, scoreRow{
				teamID: tID, serviceID: sID,
				attack: attack, defense: defense, sla: sla, total: total,
			})
		}
	}

	// Ghi xuống Database
	if _, err := db.ExecContext(ctx, `DELETE FROM scoring_scoreboard`); err != nil {
		return fmt.Errorf("failed to clear scoreboard: %w", err)
	}

	// Bulk Insert mô phỏng executemany
	if len(rowValues) > 0 {
		if err := bulkInsertScoreboard(ctx, db, rowValues); err != nil {
			return fmt.Errorf("failed to insert new scoreboard: %w", err)
		}
	}

	return nil
}

// getNOPTeamIDs trả về một map (dùng như set) chứa các ID của NOP teams
func getNOPTeamIDs(ctx context.Context, db DBTX) (map[int]bool, error) {
	rows, err := db.QueryContext(ctx, `SELECT user_id FROM registration_team WHERE nop_team = true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	nops := make(map[int]bool)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		nops[id] = true
	}
	return nops, nil
}

// bulkInsertScoreboard thực thi insert nhiều dòng cùng lúc.
// Go không có executemany, vì vậy ta tự động tạo chuỗi: INSERT INTO (...) VALUES ($1,$2,$3), ($4,$5,$6)...
func bulkInsertScoreboard(ctx context.Context, db DBTX, rows []scoreRow) error {
	valueStrings := make([]string, 0, len(rows))
	valueArgs := make([]any, 0, len(rows)*6)

	i := 1
	for _, row := range rows {
		valueStrings = append(valueStrings, fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d)", i, i+1, i+2, i+3, i+4, i+5))
		valueArgs = append(valueArgs, row.teamID, row.serviceID, row.attack, row.defense, row.sla, row.total)
		i += 6
	}

	stmt := fmt.Sprintf("INSERT INTO scoring_scoreboard (team_id, service_id, attack, defense, sla, total) VALUES %s", strings.Join(valueStrings, ","))

	_, err := db.ExecContext(ctx, stmt, valueArgs...)
	return err
}
