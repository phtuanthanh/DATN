package lib

import (
	"database/sql"
	"fmt"
	"strings"
)

type SQLite3TX struct {
	*sql.Tx
}

func translateOperation(operation string) string {
	operation = strings.TrimSpace(operation)

	if strings.HasPrefix(strings.ToUpper(operation), "LOCK TABLE") {
		return ""
	}

	operation = strings.ReplaceAll(operation, "%s", "?")

	operation = strings.ReplaceAll(operation, "NOW()", "DATETIME('now')")

	return operation
}

func (tx *SQLite3TX) Exec(query string, args ...interface{}) (sql.Result, error) {
	newQuery := translateOperation(query)
	if newQuery == "" {
		return nil, nil
	}
	return tx.Tx.Exec(newQuery, args...)
}

func (tx *SQLite3TX) Query(query string, args ...interface{}) (*sql.Rows, error) {
	newQuery := translateOperation(query)
	return tx.Tx.Query(newQuery, args...)
}

func transaction_cursor(db *sql.DB, alwaysRollback bool, fn func(tx *SQLite3TX) error) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("could not begin transaction: %w", err)
	}

	wrappedTx := &SQLite3TX{tx}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p) // Đẩy panic lên tiếp sau khi đã rollback an toàn
		}
	}()

	err = fn(wrappedTx)

	if err != nil {
		tx.Rollback()
		return err
	}

	if alwaysRollback {
		return tx.Rollback()
	}

	return tx.Commit()
}