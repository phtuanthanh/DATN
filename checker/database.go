package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/lib/pq"
	_ "github.com/lib/pq"
)

// ErrDBDataError tương đương với exceptions.DBDataError trong Python
var ErrDBDataError = errors.New("invalid database state")

// ErrCompetitionEnded indicates that the competition has already ended
var ErrCompetitionEnded = errors.New("competition has already ended")

// --- Cấu trúc dữ liệu trả về ---

type ControlInfo struct {
	ContestStart time.Time
	ValidTicks   int
	TickDuration int
	FlagPrefix   string
}

type ServiceAttributes struct {
	ID   int
	Name string
}

type Task struct {
	TeamID    int
	TeamNetNo int
	Tick      int
}

// --- Helper Functions ---

// beginTx thay thế cho transaction_cursor.
// Thiết lập ReadOnly transaction nếu prohibitChanges = true.
func beginTx(db *sql.DB, prohibitChanges bool) (*sql.Tx, error) {
	opts := &sql.TxOptions{
		ReadOnly: prohibitChanges,
	}
	return db.BeginTx(context.Background(), opts)
}

// netNoToTeamID chuyển đổi net thành id của team.
func netNoToTeamID(tx *sql.Tx, teamNetNo int, fakeTeamID *int) (*int, error) {
	var teamID int
	err := tx.QueryRow("SELECT id FROM teams WHERE net = $1", teamNetNo).Scan(&teamID)

	// Ưu tiên fakeTeamID nếu có
	if fakeTeamID != nil {
		return fakeTeamID, nil
	}

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Không tìm thấy
		}
		return nil, err
	}
	return &teamID, nil
}

// --- Main Database Functions ---

func GetControlInfo(db *sql.DB, prohibitChanges bool) (*ControlInfo, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() // Đảm bảo đóng/rollback nếu chưa commit

	var info ControlInfo
	err = tx.QueryRow("SELECT start, valid_ticks, tick_duration, flag_prefix FROM scoring_gamecontrol").
		Scan(&info.ContestStart, &info.ValidTicks, &info.TickDuration, &info.FlagPrefix)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("%w: Game control information has not been configured", ErrDBDataError)
		}
		return nil, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return &info, nil
}

func GetServiceAttributes(db *sql.DB, serviceSlug string, prohibitChanges bool) (*ServiceAttributes, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var attr ServiceAttributes
	err = tx.QueryRow("SELECT id, name FROM scoring_service WHERE slug = $1", serviceSlug).
		Scan(&attr.ID, &attr.Name)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("%w: Service has not been configured", ErrDBDataError)
		}
		return nil, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return &attr, nil
}

func GetServiceMargin(db *sql.DB, serviceSlug string, prohibitChanges bool) (float64, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var margin float64
	err = tx.QueryRow("SELECT margin FROM scoring_service WHERE slug = $1", serviceSlug).Scan(&margin)

	if err != nil {
		if err == sql.ErrNoRows {
			return 0, fmt.Errorf("%w: Service has not been configured", ErrDBDataError)
		}
		return 0, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return margin, nil
}

func GetCurrentTick(db *sql.DB, prohibitChanges bool) (int, bool, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	var currentTick int
	var cancelChecks bool
	err = tx.QueryRow("SELECT current_tick, cancel_checks FROM scoring_gamecontrol").
		Scan(&currentTick, &cancelChecks)

	if err != nil {
		if err == sql.ErrNoRows {
			return 0, false, fmt.Errorf("%w: Game control information has not been configured", ErrDBDataError)
		}
		return 0, false, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return currentTick, cancelChecks, nil
}

func GetCheckDuration(db *sql.DB, serviceID int, stdDevCount float64, prohibitChanges bool) (float64, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	query := `
		SELECT (avg(extract(epoch from (placement_end - placement_start))) + $1 *
		        stddev_pop(extract(epoch from (placement_end - placement_start))))::float
		FROM scoring_flag, scoring_gamecontrol
		WHERE service_id = $2 AND tick < current_tick`

	var duration sql.NullFloat64
	err = tx.QueryRow(query, stdDevCount, serviceID).Scan(&duration)
	if err != nil {
		return 0, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return duration.Float64, nil
}

func GetTaskCount(db *sql.DB, serviceID int, prohibitChanges bool) (int, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var count int
	query := `
		SELECT COUNT(*)
		FROM scoring_flag flag, scoring_gamecontrol control
		WHERE flag.tick = control.current_tick
		  AND flag.service_id = $1`

	err = tx.QueryRow(query, serviceID).Scan(&count)
	if err != nil {
		return 0, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return count, nil
}

func GetNewTasks(db *sql.DB, serviceID int, taskCount int, prohibitChanges bool) ([]Task, error) {
	log.Println("get_new_tasks")

	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Cần khóa bảng để tránh deadlocks do `ORDER BY RANDOM()`
	_, err = tx.Exec("LOCK TABLE scoring_flag IN EXCLUSIVE MODE")
	if err != nil {
		return nil, err
	}

	query := `
		SELECT flag.id, flag.protecting_team_id, flag.tick, team.net
		FROM scoring_flag flag, scoring_gamecontrol control, teams team
		WHERE flag.placement_start IS NULL
		  AND flag.tick = control.current_tick
		  AND flag.service_id = $1
		  AND flag.protecting_team_id = team.id
		ORDER BY RANDOM()
		LIMIT $2`

	rows, err := tx.Query(query, serviceID, taskCount)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []Task
	var flagIDs []int

	for rows.Next() {
		var flagID int
		var t Task
		if err := rows.Scan(&flagID, &t.TeamID, &t.Tick, &t.TeamNetNo); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
		flagIDs = append(flagIDs, flagID)
	}
	log.Printf("get_new_tasks fetched %d tasks\n", len(tasks))

	// Tối ưu hóa executemany của Python bằng mệnh đề IN (ANY) của Postgres
	if len(flagIDs) > 0 {
		_, err = tx.Exec(`
			UPDATE scoring_flag
			SET placement_start = NOW()
			WHERE id = ANY($1)`, pq.Array(flagIDs))

		if err != nil {
			return nil, err
		}
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return tasks, nil
}

func GetFlagID(db *sql.DB, serviceID int, teamID int, tick int, prohibitChanges bool, fakeFlagID *int) (int, error) {
	log.Printf("tick: %d, service_id: %d, team_id: %d\n", tick, serviceID, teamID)

	if fakeFlagID != nil {
		return *fakeFlagID, nil
	}

	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var id int
	query := `
		SELECT id FROM scoring_flag
		WHERE tick = $1
		  AND service_id = $2
		  AND protecting_team_id = $3`

	err = tx.QueryRow(query, tick, serviceID, teamID).Scan(&id)
	if err != nil {
		return 0, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return id, nil
}

func CommitResult(db *sql.DB, serviceID int, teamNetNo int, tick int, result int, prohibitChanges bool, fakeTeamID *int) error {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Check if competition has ended
	var endNull sql.NullTime
	err = tx.QueryRow(`SELECT "end" FROM scoring_gamecontrol LIMIT 1`).Scan(&endNull)
	if err != nil {
		return err
	}
	if endNull.Valid && !time.Now().UTC().Before(endNull.Time.UTC()) {
		return ErrCompetitionEnded
	}

	teamIDPtr, err := netNoToTeamID(tx, teamNetNo, fakeTeamID)
	if err != nil {
		return err
	}
	if teamIDPtr == nil {
		log.Printf("No team found with net number %d, cannot commit result\n", teamNetNo)
		return nil // Cố tình không trả về lỗi theo logic Python
	}
	teamID := *teamIDPtr

	_, err = tx.Exec(`
		INSERT INTO scoring_statuscheck (service_id, team_id, tick, status, timestamp)
		VALUES ($1, $2, $3, $4, NOW())`, serviceID, teamID, tick, result)
	if err != nil {
		return err
	}

	if result != 5 { // 5 = Timeout - don't update flag end time for timeout results
		_, err = tx.Exec(`
			UPDATE scoring_flag
			SET placement_end = NOW()
			WHERE service_id = $1 AND protecting_team_id = $2 AND tick = $3`, serviceID, teamID, tick)
		if err != nil {
			return err
		}
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return nil
}

func SetFlagID(db *sql.DB, serviceID int, teamNetNo int, tick int, flagid string, prohibitChanges bool, fakeTeamID *int) error {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	teamIDPtr, err := netNoToTeamID(tx, teamNetNo, fakeTeamID)
	if err != nil {
		return err
	}
	if teamIDPtr == nil {
		log.Printf("No team found with net number %d, cannot set flagid\n", teamNetNo)
		return nil
	}

	_, err = tx.Exec(`
		UPDATE scoring_flag
		SET flagid = $1
		WHERE service_id = $2 AND protecting_team_id = $3 AND tick = $4`, flagid, serviceID, *teamIDPtr, tick)

	if err != nil {
		return err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return nil
}

func LoadState(db *sql.DB, serviceID int, teamNetNo int, key string, prohibitChanges bool) (*string, error) {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var data string
	query := `
		SELECT data FROM scoring_checkerstate state, teams team
		WHERE state.service_id = $1
		  AND state.key = $2
		  AND team.net = $3
		  AND state.team_id = team.id`

	err = tx.QueryRow(query, serviceID, key, teamNetNo).Scan(&data)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Tương đương return None
		}
		return nil, err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return &data, nil
}

func StoreState(db *sql.DB, serviceID int, teamNetNo int, key string, data string, prohibitChanges bool, fakeTeamID *int) error {
	tx, err := beginTx(db, prohibitChanges)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	teamIDPtr, err := netNoToTeamID(tx, teamNetNo, fakeTeamID)
	if err != nil {
		return err
	}
	if teamIDPtr == nil {
		log.Printf("No team found with net number %d, cannot store state\n", teamNetNo)
		return nil
	}

	query := `
		INSERT INTO scoring_checkerstate (service_id, team_id, key, data)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (service_id, team_id, key)
		DO UPDATE SET data = EXCLUDED.data`

	_, err = tx.Exec(query, serviceID, *teamIDPtr, key, data)
	if err != nil {
		return err
	}

	if !prohibitChanges {
		tx.Commit()
	}
	return nil
}
