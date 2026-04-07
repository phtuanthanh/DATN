package main

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

var (
	ErrDBData           = errors.New("game control information has not been configured")
	ErrDuplicateCapture = errors.New("duplicate capture")
	ErrTeamNotExisting  = errors.New("team not existing")
	ErrCompetitionEnded = errors.New("competition has already ended")
)

func GetStaticInfo(db *sql.DB) (competitionName, flagPrefix string, err error) {
	err = db.QueryRow(`SELECT competition_name, flag_prefix FROM scoring_gamecontrol LIMIT 1`).Scan(&competitionName, &flagPrefix)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", ErrDBData
		}
		return "", "", err
	}

	if competitionName == "" || flagPrefix == "" {
		return "", "", ErrDBData
	}

	return competitionName, flagPrefix, nil
}

func GetDynamicInfo(db *sql.DB) (start, end time.Time, err error) {
	var startNull sql.NullTime
	var endNull sql.NullTime

	err = db.QueryRow(`SELECT start, "end" FROM scoring_gamecontrol LIMIT 1`).Scan(&startNull, &endNull)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return time.Time{}, time.Time{}, ErrDBData
		}
		return time.Time{}, time.Time{}, err
	}

	if !startNull.Valid || !endNull.Valid {
		return time.Time{}, time.Time{}, ErrDBData
	}

	return startNull.Time.UTC(), endNull.Time.UTC(), nil
}

// TeamIsNOP is no longer used - nop_team functionality removed
func TeamIsNOP(db *sql.DB, netNumber int) (bool, error) {
	return false, nil
}

func AddCapture(db *sql.DB, flagID uint32, capturingTeamNetNo int) error {
	tx, err := db.Begin()
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

	var teamID int
	err = tx.QueryRow(`SELECT id FROM teams WHERE net = $1`, capturingTeamNetNo).Scan(&teamID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrTeamNotExisting
		}
		return err
	}

	var currentTick int
	err = tx.QueryRow(`SELECT current_tick FROM scoring_gamecontrol`).Scan(&currentTick)
	if err != nil {
		return err
	}

	_, err = tx.Exec(
		`INSERT INTO scoring_capture (flag_id, capturing_team_id, timestamp, tick) VALUES ($1, $2, NOW(), $3)`,
		int64(flagID), teamID, currentTick,
	)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && string(pqErr.Code) == "23505" {
			return ErrDuplicateCapture
		}
		return fmt.Errorf("failed to insert capture: %w", err)
	}

	return tx.Commit()
}
