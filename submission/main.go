package main

import (
	"bufio"
	"database/sql"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	lib "submission/lib"

	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const timeoutSeconds = 300 * time.Second

const (
	exitOK          = 0
	exitUsage       = 64
	exitUnavailable = 69
	exitIOErr       = 74
	exitNoPerm      = 77
)

type submissionMetrics struct {
	connections         *prometheus.CounterVec
	flagsOK             *prometheus.CounterVec
	flagsDup            *prometheus.CounterVec
	flagsOld            *prometheus.CounterVec
	flagsOwn            *prometheus.CounterVec
	flagsInv            *prometheus.CounterVec
	flagsErr            *prometheus.CounterVec
	serverKills         prometheus.Counter
	unhandledExceptions prometheus.Counter
	startTimestamp      prometheus.Gauge
	openConnections     *prometheus.GaugeVec
	submissionDuration  prometheus.Histogram
}

type runtimeParams struct {
	flagSecret      []byte
	teamRegex       *regexp.Regexp
	competitionName string
	flagPrefix      string
	metrics         *submissionMetrics
}

func main() {
	listenArg := flag.String("listen", "localhost:6666", "Address and port to listen on (\"<host>:<port>\")")
	flagSecretArg := flag.String("flagsecret", "", "Base64 string used as secret in flag generation")
	teamRegexArg := flag.String("teamregex", "", "Regex (with one match group) to extract team net number from client IP")
	metricsListenArg := flag.String("metrics-listen", "", "Expose Prometheus metrics via HTTP (\"<host>:<port>\")")
	logLevelArg := flag.String("loglevel", "WARNING", "Log level: DEBUG, INFO, WARNING, ERROR")
	dbHostArg := flag.String("dbhost", "", "Database host")
	dbNameArg := flag.String("dbname", "", "Database name")
	dbUserArg := flag.String("dbuser", "", "Database user")
	dbPassArg := flag.String("dbpassword", "", "Database password")
	flag.Parse()

	log.SetFlags(0)
	setLogLevel(*logLevelArg)

	if *flagSecretArg == "" || *teamRegexArg == "" || *dbNameArg == "" || *dbUserArg == "" {
		log.Printf("[ERROR] Missing required arguments")
		os.Exit(exitUsage)
	}

	listenHost, listenPort, listenFamily, err := lib.ParseHostPort(*listenArg)
	if err != nil {
		log.Printf("[ERROR] Listen address needs to be specified as \"<host>:<port>\": %v", err)
		os.Exit(exitUsage)
	}

	flagSecret, err := base64.StdEncoding.DecodeString(*flagSecretArg)
	if err != nil {
		log.Printf("[ERROR] Flag secret must be valid Base64")
		os.Exit(exitUsage)
	}

	teamRegex, err := regexp.Compile(*teamRegexArg)
	if err != nil {
		log.Printf("[ERROR] Team regex must be a valid regular expression")
		os.Exit(exitUsage)
	}
	if teamRegex.NumSubexp() != 1 {
		log.Printf("[ERROR] Team regex must contain one match group")
		os.Exit(exitUsage)
	}

	dsn := fmt.Sprintf("host=%s dbname=%s user=%s password=%s sslmode=disable", *dbHostArg, *dbNameArg, *dbUserArg, *dbPassArg)
	dbConn, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Printf("[ERROR] Could not establish database connection: %v", err)
		os.Exit(exitUnavailable)
	}
	defer dbConn.Close()

	if err := dbConn.Ping(); err != nil {
		log.Printf("[ERROR] Could not establish database connection: %v", err)
		os.Exit(exitUnavailable)
	}
	log.Printf("[INFO] Established database connection")

	if _, err := dbConn.Exec(`SET TIME ZONE "UTC"`); err != nil {
		log.Printf("[ERROR] Failed to set UTC timezone: %v", err)
		os.Exit(exitUnavailable)
	}

	if _, _, err := GetStaticInfo(dbConn); err != nil {
		if errors.Is(err, ErrDBData) {
			log.Printf("[WARNING] Invalid database state: %v", err)
		} else {
			log.Printf("[ERROR] Database static info check failed: %v", err)
			os.Exit(exitUnavailable)
		}
	}
	if _, _, err := GetDynamicInfo(dbConn); err != nil {
		if errors.Is(err, ErrDBData) {
			log.Printf("[WARNING] Invalid database state: %v", err)
		} else {
			log.Printf("[ERROR] Database dynamic info check failed: %v", err)
			os.Exit(exitUnavailable)
		}
	}
	if _, err := TeamIsNOP(dbConn, 1); err != nil {
		log.Printf("[ERROR] Missing database permissions: %v", err)
		os.Exit(exitNoPerm)
	}
	if err := checkCapturePermission(dbConn); err != nil {
		log.Printf("[ERROR] Missing database permissions: %v", err)
		os.Exit(exitNoPerm)
	}

	if *metricsListenArg != "" {
		metricsHost, metricsPort, metricsFamily, err := lib.ParseHostPort(*metricsListenArg)
		if err != nil {
			log.Printf("[ERROR] Metrics listen address needs to be specified as \"<host>:<port>\": %v", err)
			os.Exit(exitUsage)
		}

		if err := lib.StartMetricsServer(metricsHost, metricsPort, familyToNetwork(metricsFamily), nil); err != nil {
			log.Printf("[ERROR] Could not start metrics server: %v", err)
			os.Exit(exitUsage)
		}
	}

	metrics := makeMetrics()
	metrics.startTimestamp.SetToCurrentTime()

	log.Printf("[INFO] READY=1")

	competitionName := ""
	flagPrefix := ""
	for {
		competitionName, flagPrefix, err = GetStaticInfo(dbConn)
		if err != nil {
			if errors.Is(err, ErrDBData) {
				log.Printf("[WARNING] Invalid database state, sleeping for 60 seconds: %v", err)
				time.Sleep(60 * time.Second)
				continue
			}
			log.Printf("[ERROR] Failed to read static info: %v", err)
			os.Exit(exitUnavailable)
		}
		break
	}

	params := runtimeParams{
		flagSecret:      flagSecret,
		teamRegex:       teamRegex,
		competitionName: competitionName,
		flagPrefix:      flagPrefix,
		metrics:         metrics,
	}

	if err := serve(listenHost, listenPort, familyToNetwork(listenFamily), dbConn, params); err != nil {
		log.Printf("[ERROR] Submission server stopped: %v", err)
		os.Exit(exitUnavailable)
	}

	os.Exit(exitOK)
}

func makeMetrics() *submissionMetrics {
	prefix := "ctf_submission_"

	return &submissionMetrics{
		connections: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "connections",
			Help: "Total number of connections",
		}, []string{"team_net_no"}),
		flagsOK: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "flags_ok",
			Help: "Number of submitted valid flags",
		}, []string{"team_net_no"}),
		flagsDup: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "flags_dup",
			Help: "Number of submitted duplicate flags",
		}, []string{"team_net_no"}),
		flagsOld: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "flags_old",
			Help: "Number of submitted expired flags",
		}, []string{"team_net_no"}),
		flagsOwn: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "flags_own",
			Help: "Number of submitted own flags",
		}, []string{"team_net_no"}),
		flagsInv: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "flags_inv",
			Help: "Number of submitted invalid flags",
		}, []string{"team_net_no"}),
		flagsErr: promauto.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + "flags_err",
			Help: "Number of submitted flags which resulted in an error",
		}, []string{"team_net_no"}),
		serverKills: promauto.NewCounter(prometheus.CounterOpts{
			Name: prefix + "server_kills",
			Help: "Number of times the server was force-restarted due to fatal errors",
		}),
		unhandledExceptions: promauto.NewCounter(prometheus.CounterOpts{
			Name: prefix + "unhandled_exceptions",
			Help: "Number of unexpected exceptions in client connections",
		}),
		startTimestamp: promauto.NewGauge(prometheus.GaugeOpts{
			Name: prefix + "start_timestamp",
			Help: "(Unix) timestamp when the process was started",
		}),
		openConnections: promauto.NewGaugeVec(prometheus.GaugeOpts{
			Name: prefix + "open_connections",
			Help: "Number of currently open connections",
		}, []string{"team_net_no"}),
		submissionDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name: prefix + "submission_duration",
			Help: "Time spent processing a single flag in seconds",
		}),
	}
}

func serve(host string, port int, network string, dbConn *sql.DB, params runtimeParams) error {
	listenAddr := fmt.Sprintf("%s:%d", host, port)
	listener, err := net.Listen(network, listenAddr)
	if err != nil {
		return fmt.Errorf("listen failed: %w", err)
	}
	defer listener.Close()

	log.Printf("[INFO] Starting server on %s", listenAddr)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("[WARNING] Accept error: %v", err)
			continue
		}

		go func(c net.Conn) {
			defer c.Close()

			if err := handleConnection(c, dbConn, params); err != nil {
				var killErr *KillServerError
				if errors.As(err, &killErr) {
					log.Printf("[ERROR] Encountered fatal error, exiting")
					params.metrics.serverKills.Inc()
					os.Exit(exitIOErr)
				}

				if errors.Is(err, net.ErrClosed) {
					return
				}

				params.metrics.unhandledExceptions.Inc()
				clientHost, _, splitErr := net.SplitHostPort(c.RemoteAddr().String())
				if splitErr != nil {
					clientHost = c.RemoteAddr().String()
				}
				log.Printf("[ERROR] [%s]: Exception in client connection, closing the connection: %v", clientHost, err)
			}
		}(conn)
	}
}

func handleConnection(conn net.Conn, dbConn *sql.DB, params runtimeParams) error {
	clientAddr, _, err := net.SplitHostPort(conn.RemoteAddr().String())
	if err != nil {
		clientAddr = conn.RemoteAddr().String()
	}

	clientNetNo, err := matchNetNumber(params.teamRegex, clientAddr)
	if err != nil {
		log.Printf("[ERROR] [%s]: Could not match client address with team, closing the connection", clientAddr)
		params.metrics.connections.WithLabelValues("-1").Inc()
		_, _ = conn.Write([]byte("Error: Could not match your IP address with a team\n"))
		return nil
	}

	clientNetNoStr := strconv.Itoa(clientNetNo)
	params.metrics.connections.WithLabelValues(clientNetNoStr).Inc()
	params.metrics.openConnections.WithLabelValues(clientNetNoStr).Inc()
	defer params.metrics.openConnections.WithLabelValues(clientNetNoStr).Dec()

	if err := handleTeamConnection(conn, dbConn, params, clientAddr, clientNetNo); err != nil {
		return err
	}

	return nil
}

func handleTeamConnection(conn net.Conn, dbConn *sql.DB, params runtimeParams, clientAddr string, clientNetNo int) error {
	teamLabel := strconv.Itoa(clientNetNo)
	logWithClient := func(level string, format string, args ...interface{}) {
		msg := fmt.Sprintf(format, args...)
		log.Printf("[%s] %d [%s]: %s", strings.ToUpper(level), clientNetNo, clientAddr, msg)
	}

	logWithClient("INFO", "Accepted connection from %s (team net number %d)", clientAddr, clientNetNo)

	intro := ("\n" +
		"  ┌─────────────────────────────────────────────────────┐\n" +
		"  │  AD - FLAG SUBMISSION                               │\n" +
		"  ├─────────────────────────────────────────────────────┤\n" +
		"  │  [*] Capture The Flag Scoring Platform              │\n" +
		"  ├─────────────────────────────────────────────────────┤\n" +
		"  │  • Submit one valid flag per line                   │\n" +
		"  │  • UTF-8 encoding required                          │\n" +
		"  │  • Read timeout: 5 minutes                          │\n" +
		"  │  • Connection auto-closes on timeout                │\n" +
		"  └─────────────────────────────────────────────────────┘\n\n")
	if _, err := conn.Write([]byte(intro)); err != nil {
		return err
	}

	scanner := bufio.NewScanner(conn)
	lineStart := time.Time{}

	for {
		if !lineStart.IsZero() {
			params.metrics.submissionDuration.Observe(time.Since(lineStart).Seconds())
		}

		if err := conn.SetReadDeadline(time.Now().Add(timeoutSeconds)); err != nil {
			logWithClient("INFO", "Read timeout setup failed")
			break
		}

		if !scanner.Scan() {
			if scanErr := scanner.Err(); scanErr != nil {
				if ne, ok := scanErr.(net.Error); ok && ne.Timeout() {
					logWithClient("INFO", "Read timeout expired")
					break
				}
				return scanErr
			}
			break
		}

		lineStart = time.Now()
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		isASCII := true
		for _, r := range line {
			if r > 127 {
				isASCII = false
				break
			}
		}
		if !isASCII {
			_, _ = conn.Write([]byte("Invalid flag because is not encoding\n"))
			logWithClient("INFO", "Flag %q rejected due to bad encoding", line)
			params.metrics.flagsInv.WithLabelValues(teamLabel).Inc()
			continue
		}

		// Strip closing brace if present (accept both "prefix{data}" and "prefix{data}")
		if strings.HasSuffix(line, "}") {
			line = line[:len(line)-1]
		}

		flagID, protectingNetNo, err := lib.Verify(line, params.flagSecret, params.flagPrefix)
		if err != nil {
			if errors.Is(err, lib.ErrInvalidFlagFormat) {
				_, _ = conn.Write([]byte("Invalid flag because invalid format\n"))
				logWithClient("INFO", "Flag %q rejected due to invalid format", line)
				params.metrics.flagsInv.WithLabelValues(teamLabel).Inc()
				continue
			}
			if errors.Is(err, lib.ErrInvalidFlagMAC) {
				_, _ = conn.Write([]byte("Invalid flag because invalid MAC\n"))
				logWithClient("INFO", "Flag %q rejected due to invalid MAC", line)
				params.metrics.flagsInv.WithLabelValues(teamLabel).Inc()
				continue
			}

			var expiredErr *lib.ErrFlagExpired
			if errors.As(err, &expiredErr) {
				_, _ = conn.Write([]byte("Flag has expired\n"))
				logWithClient("WARNING", "Flag %q rejected because it has expired since %s and now=%s", line, expiredErr.ExpirationTime, time.Now().UTC())
				params.metrics.flagsOld.WithLabelValues(teamLabel).Inc()
				continue
			}

			return &KillServerError{Err: err}
		}

		if int(protectingNetNo) == clientNetNo {
			_, _ = conn.Write([]byte("You cannot submit your own flag\n"))
			logWithClient("INFO", "Flag %q rejected because it is protected by submitting team", line)
			params.metrics.flagsOwn.WithLabelValues(teamLabel).Inc()
			continue
		}

		now := time.Now().UTC()
		start, end, err := GetDynamicInfo(dbConn)
		if err != nil {
			return &KillServerError{Err: err}
		}

		if now.Before(start) {
			_, _ = conn.Write([]byte("Competition has not even started yet\n"))
			logWithClient("INFO", "Flag %q rejected because competition has not started", line)
			params.metrics.flagsErr.WithLabelValues(teamLabel).Inc()
			continue
		}
		if !now.Before(end) {
			_, _ = conn.Write([]byte("Competition is over\n"))
			logWithClient("INFO", "Flag %q rejected because competition is over", line)
			params.metrics.flagsErr.WithLabelValues(teamLabel).Inc()
			continue
		}

		isNOP, err := TeamIsNOP(dbConn, int(protectingNetNo))
		if err != nil {
			return &KillServerError{Err: err}
		}
		if isNOP {
			_, _ = conn.Write([]byte("You cannot submit flags of a NOP team\n"))
			logWithClient("INFO", "Flag %q rejected because it is protected by a NOP team", line)
			params.metrics.flagsInv.WithLabelValues(teamLabel).Inc()
			continue
		}

		err = AddCapture(dbConn, flagID, clientNetNo)
		if err == nil {
			_, _ = conn.Write([]byte("Flag submission is accepted\n"))
			logWithClient("INFO", "Flag %q accepted", line)
			params.metrics.flagsOK.WithLabelValues(teamLabel).Inc()
			continue
		}

		if errors.Is(err, ErrDuplicateCapture) {
			_, _ = conn.Write([]byte("You already submitted this flag\n"))
			logWithClient("INFO", "Flag %q rejected because it has already been submitted before", line)
			params.metrics.flagsDup.WithLabelValues(teamLabel).Inc()
			continue
		}

		if errors.Is(err, ErrTeamNotExisting) {
			_, _ = conn.Write([]byte("Could not find team\n"))
			logWithClient("WARNING", "Flag %q: Could not find team for net number %d in database", line, clientNetNo)
			params.metrics.flagsErr.WithLabelValues(teamLabel).Inc()
			continue
		}

		if errors.Is(err, ErrCompetitionEnded) {
			_, _ = conn.Write([]byte("Competition has already ended\n"))
			logWithClient("WARNING", "Flag %q rejected because competition has ended", line)
			params.metrics.flagsErr.WithLabelValues(teamLabel).Inc()
			continue
		}

		return &KillServerError{Err: err}
	}

	logWithClient("INFO", "Closing connection")
	return nil
}

func checkCapturePermission(dbConn *sql.DB) error {
	tx, err := dbConn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO scoring_capture (flag_id, capturing_team_id, timestamp, tick)
		SELECT flag.id, flag.protecting_team_id, NOW(), flag.tick
		FROM scoring_flag flag
		LIMIT 1
		ON CONFLICT DO NOTHING
	`)
	return err
}

func matchNetNumber(regex *regexp.Regexp, addr string) (int, error) {
	match := regex.FindStringSubmatch(addr)
	if len(match) < 2 {
		return 0, fmt.Errorf("could not match net number")
	}

	netNo, err := strconv.Atoi(match[1])
	if err != nil {
		return 0, err
	}

	return netNo, nil
}

func familyToNetwork(family int) string {
	switch family {
	case syscall.AF_INET:
		return "tcp4"
	case syscall.AF_INET6:
		return "tcp6"
	default:
		return "tcp"
	}
}

func setLogLevel(level string) {
	switch strings.ToUpper(level) {
	case "DEBUG":
		log.SetPrefix("[DEBUG] ")
	case "INFO":
		log.SetPrefix("[INFO] ")
	case "WARNING":
		log.SetPrefix("[WARNING] ")
	case "ERROR":
		log.SetPrefix("[ERROR] ")
	default:
		log.SetPrefix("[INFO] ")
	}
}

func centerText(text string, width int) string {
	if len(text) >= width {
		return text
	}
	pad := (width - len(text)) / 2
	return strings.Repeat(" ", pad) + text + strings.Repeat(" ", width-len(text)-pad)
}

type KillServerError struct {
	Err error
}

func (e *KillServerError) Error() string {
	if e == nil || e.Err == nil {
		return "kill server"
	}
	return e.Err.Error()
}

func (e *KillServerError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}
