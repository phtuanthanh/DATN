package main

import (
	"context"
	"controller/lib"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"sync"
	"syscall"
	"time"

	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Cấu trúc lưu trữ các Prometheus metrics cơ bản
type Metrics struct {
	StartTimestamp          prometheus.Gauge
	CurrentTick             prometheus.Gauge
	TickChangeDelaySeconds  prometheus.Histogram
	ScoreboardUpdateSeconds prometheus.Histogram
}

func main() {
	fmt.Println("CTF Gameserver Controller")

	// 1. Parse Arguments
	var dbHost, dbName, dbUser, dbPassword string
	var nonstop bool
	var metricsListen string

	flag.StringVar(&dbHost, "dbhost", "localhost", "Database host")
	flag.StringVar(&dbName, "dbname", "ctf_db", "Database name")
	flag.StringVar(&dbUser, "dbuser", "hades", "Database user")
	flag.StringVar(&dbPassword, "dbpassword", "lgedv2024", "Database password")
	flag.BoolVar(&nonstop, "nonstop", false, "Use current time as start time and ignore CTF end time")
	flag.StringVar(&metricsListen, "metrics-listen", "", "Expose Prometheus metrics via HTTP (\"<host>:<port>\")")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[INFO] ")

	// 2. Kết nối Database
	dsn := fmt.Sprintf("host=%s dbname=%s user=%s password=%s sslmode=disable", dbHost, dbName, dbUser, dbPassword)
	dbConn, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("[ERROR] Could not establish database connection: %v", err)
	}
	defer dbConn.Close()

	if err := dbConn.Ping(); err != nil {
		log.Fatalf("[ERROR] Database unreachable: %v", err)
		os.Exit(1) // EX_UNAVAILABLE
	}
	log.Println("Established database connection")

	// Set Timezone
	if _, err := dbConn.Exec(`SET TIME ZONE 'UTC'`); err != nil {
		log.Fatalf("[ERROR] Failed to set timezone: %v", err)
	}

	// (Bỏ qua phần check Database Grants tương tự python để tập trung vào logic loop.
	// Bạn có thể wrap dbConn.Begin() và Rollback() nếu muốn test quyền).

	// 3. Khởi tạo Prometheus Metrics
	if metricsListen != "" {
		host, port, family, err := lib.ParseHostPort(metricsListen)
		if err != nil {
			log.Fatalf("[ERROR] Invalid metrics listen address %q: %v", metricsListen, err)
		}

		network := "tcp"
		switch family {
		case syscall.AF_INET:
			network = "tcp4"
		case syscall.AF_INET6:
			network = "tcp6"
		}

		if err := lib.StartMetricsServer(host, port, network, nil); err != nil {
			log.Fatalf("[ERROR] Failed to start metrics server: %v", err)
			os.Exit(64) // EX_USAGE
		}
	}

	appMetrics := makeMetrics(dbConn)
	appMetrics.StartTimestamp.Set(float64(time.Now().Unix()))

	// Báo hiệu daemon sẵn sàng (systemd notify)
	// (Go thường dùng package github.com/coreos/go-systemd/daemon)
	log.Println("READY=1")

	var scoringLock sync.Mutex

	// 4. Vòng lặp chính
	ctx := context.Background()
	for {
		mainLoopStep(ctx, dbConn, appMetrics, &scoringLock, nonstop)
	}
}

// --- Logic Vòng Lặp Chính ---

func mainLoopStep(ctx context.Context, dbConn *sql.DB, m *Metrics, scoringLock *sync.Mutex, nonstop bool) {
	sleep := func(d time.Duration) {
		if d > 0 {
			log.Printf("Sleeping for %v", d)
		}
		time.Sleep(d)
	}

	controlInfo, err := GetControlInfo(ctx, dbConn)
	if err != nil {
		log.Printf("[WARNING] Invalid database state: %v", err)
		sleep(60 * time.Second)
		return
	}

	m.CurrentTick.Set(float64(controlInfo.CurrentTick))

	if controlInfo.Start.IsZero() || controlInfo.End.IsZero() {
		log.Println("[WARNING] Competition start and end time must be configured in the database")
		sleep(60 * time.Second)
		return
	}

	sleepSeconds := getSleepSeconds(controlInfo, m, time.Time{})

	// Capping tối đa 60 giây
	if sleepSeconds > 60 {
		sleepSeconds = 60
	}
	sleep(time.Duration(sleepSeconds) * time.Second)

	// Fetch lại info mới sau khi sleep
	controlInfo, err = GetControlInfo(ctx, dbConn)
	if err != nil {
		log.Printf("[WARNING] Could not refresh control info: %v", err)
		sleep(1 * time.Second)
		return
	}
	now := time.Now().UTC()

	totalDurationSecs := controlInfo.End.Sub(controlInfo.Start).Seconds()
	if int(totalDurationSecs)%controlInfo.TickDuration != 0 {
		log.Println("[WARNING] Competition duration not divisible by tick duration, strange things might happen")
	}

	if now.Before(controlInfo.Start) {
		log.Println("Competition has not started yet")
		return
	}

	if !nonstop && (now.After(controlInfo.End) || now.Equal(controlInfo.End)) {
		CancelChecks(ctx, dbConn)
		CalculateScoreboard(ctx, dbConn) // Update lần cuối

		log.Println("Competition is already over")
		sleep(60 * time.Second)
		return
	}

	if getSleepSeconds(controlInfo, m, now) <= 0 {
		// Check if the next tick would go beyond competition end time
		nextTickStartOffset := time.Duration((controlInfo.CurrentTick+1)*controlInfo.TickDuration) * time.Second
		nextTickStart := controlInfo.Start.Add(nextTickStartOffset)

		// If next tick start is after or at end time, don't increase tick when not in nonstop mode
		if !nonstop && (nextTickStart.After(controlInfo.End) || nextTickStart.Equal(controlInfo.End)) {
			log.Printf("Next tick would start at %v, which is at or after competition end time %v. Not increasing tick.", nextTickStart, controlInfo.End)
			CancelChecks(ctx, dbConn)
			CalculateScoreboard(ctx, dbConn) // Final update
			log.Println("Competition is already over")
			sleep(60 * time.Second)
			return
		}

		log.Printf("After tick %d, increasing tick to the next one", controlInfo.CurrentTick)

		tx, err := dbConn.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[WARNING] Could not begin tick transaction: %v", err)
			sleep(1 * time.Second)
			return
		}

		if err := IncreaseTick(ctx, tx); err != nil {
			log.Printf("[WARNING] Could not increase tick: %v", err)
			_ = tx.Rollback()
			sleep(1 * time.Second)
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("[WARNING] Could not commit tick transaction: %v", err)
			sleep(1 * time.Second)
			return
		}

		calculateScoreboardInThread(ctx, dbConn, m, scoringLock)
	}
}

// Hàm chạy Goroutine không chặn (non-blocking)
func calculateScoreboardInThread(ctx context.Context, dbConn *sql.DB, m *Metrics, lock *sync.Mutex) {
	go func() {
		// TryLock: Yêu cầu Go 1.18+. Trả về false nếu lock đang bị giữ bởi goroutine khác.
		if !lock.TryLock() {
			log.Println("[WARNING] Skipping scoreboard calculation because previous run is still ongoing")
			return
		}
		defer lock.Unlock()

		start := time.Now()
		CalculateScoreboard(ctx, dbConn)

		duration := time.Since(start).Seconds()
		m.ScoreboardUpdateSeconds.Observe(duration)
		log.Println("New scoreboard calculated")
	}()
}

func getSleepSeconds(controlInfo *ControlInfo, m *Metrics, now time.Time) float64 {
	if now.IsZero() {
		now = time.Now().UTC()
	}

	nextTickStartOffset := time.Duration((controlInfo.CurrentTick+1)*controlInfo.TickDuration) * time.Second
	nextTickStart := controlInfo.Start.Add(nextTickStartOffset)

	untilNextTickSecs := nextTickStart.Sub(now).Seconds()

	if untilNextTickSecs <= 0 {
		m.TickChangeDelaySeconds.Observe(-1 * untilNextTickSecs)
	}

	return math.Max(untilNextTickSecs, 0)
}

// --- Prometheus Custom Collector ---

func makeMetrics(dbConn *sql.DB) *Metrics {
	m := &Metrics{}
	prefix := "ctf_controller_"

	m.StartTimestamp = promauto.NewGauge(prometheus.GaugeOpts{
		Name: prefix + "start_timestamp",
		Help: "(Unix) timestamp when the process was started",
	})
	m.CurrentTick = promauto.NewGauge(prometheus.GaugeOpts{
		Name: prefix + "current_tick",
		Help: "The current tick",
	})
	m.TickChangeDelaySeconds = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    prefix + "tick_change_delay_seconds",
		Help:    "Differences between supposed and actual tick change times",
		Buckets: []float64{1, 3, 5, 10, 30, 60, math.Inf(1)},
	})
	m.ScoreboardUpdateSeconds = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    prefix + "scoreboard_update_seconds",
		Help:    "Time spent calculating the scoreboard",
		Buckets: []float64{0.1, 0.5, 1, 3, 5, 10, 30, 60, 120, 180, 240, math.Inf(1)},
	})

	// Register Custom Collector
	prometheus.MustRegister(&DatabaseCollector{db: dbConn})

	return m
}

type DatabaseCollector struct {
	db *sql.DB
}

// Describe gửi mô tả của tất cả metrics tĩnh
func (c *DatabaseCollector) Describe(ch chan<- *prometheus.Desc) {
	// Optional: Khai báo description nếu muốn tuân thủ strict prometheus implementation
}

// Collect chạy mỗi khi có request tới endpoint /metrics
func (c *DatabaseCollector) Collect(ch chan<- prometheus.Metric) {
	ctx := context.Background()
	prefix := "ctf_controller_"

	exploitingDesc := prometheus.NewDesc(prefix+"exploiting_teams", "Number of teams that submitted at least one flag", []string{"service"}, nil)
	isExploitedDesc := prometheus.NewDesc(prefix+"is_exploited", "Whether at least one team submitted at least one flag", []string{"service"}, nil)

	if counts, err := GetExploitingTeamsCounts(ctx, c.db); err == nil {
		for service, count := range counts {
			ch <- prometheus.MustNewConstMetric(exploitingDesc, prometheus.CounterValue, float64(count), service)
			isExp := 0.0
			if count > 0 {
				isExp = 1.0
			}
			ch <- prometheus.MustNewConstMetric(isExploitedDesc, prometheus.GaugeValue, isExp, service)
		}
	}

	unplacedDesc := prometheus.NewDesc(prefix+"unplaced_flags", "Flags whose placement was not started by a checker", []string{"service", "ticks"}, nil)
	if counts, err := GetUnplacedFlagsCountsCur(ctx, c.db); err == nil {
		for svc, count := range counts {
			ch <- prometheus.MustNewConstMetric(unplacedDesc, prometheus.CounterValue, float64(count), svc, "cur")
		}
	}
	if counts, err := GetUnplacedFlagsCountsOld(ctx, c.db); err == nil {
		for svc, count := range counts {
			ch <- prometheus.MustNewConstMetric(unplacedDesc, prometheus.CounterValue, float64(count), svc, "old")
		}
	}

	// (Làm tương tự cho incomplete_flags_counts_cur / old)
}
