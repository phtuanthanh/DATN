package main

import (
	"database/sql"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	_ "github.com/lib/pq" // PostgreSQL driver

	lib "checker/lib"
)

// --- Constants ---
const (
	ActionFlag       = "FLAG"
	ActionFlagID     = "FLAGID"
	ActionLoad       = "LOAD"
	ActionStore      = "STORE"
	ActionLog        = "LOG"
	ActionResult     = "RESULT"
	ActionRunnerExit = "RUNNER_EXIT"
)

// MasterLoop đóng vai trò quản lý vòng lặp chính của Checker Master
type MasterLoop struct {
	dbConn        *sql.DB
	serviceSlug   string
	serviceID     int
	checkerScript string
	sudoUser      string
	stdDevCount   float64
	checkerCount  int
	interval      time.Duration
	ipPattern     string
	flagSecret    []byte
	loggingParams map[string]interface{}
	metricsQueue  chan interface{}

	supervisor     *RunnerSupervisor
	knownTick      int
	lastLaunch     time.Time
	tasksPerLaunch int
	shuttingDown   bool

	contestStart   time.Time
	tickDuration   time.Duration
	flagValidTicks int
	flagPrefix     string
}

func main() {
	// Parse flags directly
	log.Printf("[INFO] Checker process started at %v", time.Now())
	serviceArg := flag.String("service", "", "Service identifier")

	checkerScriptArg := flag.String("checkerscript", "", "Path to checker script executable")

	flagSecretArg := flag.String("flagsecret", "", "Base64 string used as secret in flag generation")

	sudoUserArg := flag.String("sudouser", "root", "User to run checker script as")

	stdDeviationsArg := flag.Float64("stddeviations", 2.0, "Standard deviations for scoring")

	checkerCountArg := flag.Int("checkercount", 50, "Number of concurrent checker processes")

	intervalArg := flag.Float64("interval", 60.0, "Interval between checker runs in seconds")

	ipPatternArg := flag.String("ippattern", "", "IP pattern for target hosts")

	logLevelArg := flag.String("loglevel", "WARNING", "Log level: DEBUG, INFO, WARNING, ERROR")

	journaldArg := flag.Bool("journald", false, "Enable journald logging")

	gelfServerArg := flag.String("gelf-server", "", "GELF server address (\"<host>:<port>\")")

	metricsListenArg := flag.String("metrics-listen", "", "Metrics HTTP server listen address (\"<host>:<port>\")")

	dbHostArg := flag.String("dbhost", "", "Database host")

	dbNameArg := flag.String("dbname", "", "Database name")

	dbUserArg := flag.String("dbuser", "", "Database user")

	dbPassArg := flag.String("dbpassword", "", "Database password")

	flag.Parse()

	log.SetFlags(0)
	setLogLevel(*logLevelArg)

	// Validate required arguments
	if *serviceArg == "" || *checkerScriptArg == "" || *flagSecretArg == "" || *dbNameArg == "" || *dbUserArg == "" {
		log.Printf("[ERROR] Missing required arguments")
		os.Exit(1)
	}

	// Validate interval
	if *intervalArg < 3 {
		log.Printf("[ERROR] `--interval` must be at least 3 seconds")
		os.Exit(1)
	}

	// Setup logging parameters
	loggingParams := make(map[string]interface{})

	// Configure journald logging
	if *journaldArg {
		loggingParams["journald"] = true
		log.Printf("[INFO] Journald logging enabled")
	}

	// Configure GELF logging
	if *gelfServerArg != "" {
		host, port, family, err := lib.ParseHostPort(*gelfServerArg)
		if err != nil {
			log.Printf("[ERROR] GELF server needs to be specified as \"<host>:<port>\": %v", err)
			os.Exit(1)
		}
		loggingParams["gelf"] = map[string]interface{}{"host": host, "port": port, "family": family}
		log.Printf("[INFO] GELF logging configured: %s:%d", host, port)
	}

	// Setup metrics
	var metricsQueue chan interface{}
	if *metricsListenArg != "" {
		host, port, _, err := lib.ParseHostPort(*metricsListenArg)
		if err != nil {
			log.Printf("[ERROR] Metrics listen address needs to be specified as \"<host>:<port>\": %v", err)
			os.Exit(1)
		}
		metricsQueue = make(chan interface{}, 100)
		go RunCollector(*serviceArg, metricsQueue)
		go RunHTTPServer(host, port)
		log.Printf("[INFO] Started metrics HTTP server on %s:%d", host, port)

		Set(metricsQueue, "interval_length_seconds", *intervalArg, map[string]string{})
		Set(metricsQueue, "start_timestamp", float64(time.Now().Unix()), map[string]string{})
	} else {
		metricsQueue = make(chan interface{}, 1) // dummy queue
	}

	// Decode flag secret
	flagSecret, err := base64.StdEncoding.DecodeString(*flagSecretArg)
	if err != nil {
		log.Printf("[ERROR] Could not decode flagsecret (must be base64): %v", err)
		os.Exit(1)
	}

	// Connect to database
	connStr := fmt.Sprintf("host=%s dbname=%s user=%s password=%s sslmode=disable",
		*dbHostArg, *dbNameArg, *dbUserArg, *dbPassArg)
	dbConn, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Printf("[ERROR] Could not establish connection to database: %v", err)
		os.Exit(1)
	}
	defer dbConn.Close()

	// Keep timezone as UTC - web frontend handles VN display
	if _, err := dbConn.Exec("SET TIME ZONE 'UTC'"); err != nil {
		log.Printf("[ERROR] Could not set timezone: %v", err)
		os.Exit(1)
	}
	log.Printf("[INFO] Established connection to database")

	// Check database permissions
	var serviceID int
	_, err = GetControlInfo(dbConn, false)
	if err != nil {
		log.Printf("[WARNING] Invalid database state: %v", err)
	}

	serviceAttrs, err := GetServiceAttributes(dbConn, *serviceArg, false)
	if err != nil {
		log.Printf("[WARNING] Invalid database state: %v", err)
		serviceID = 1337 // dummy value for subsequent checks
	} else {
		serviceID = serviceAttrs.ID
	}

	_, err = GetServiceMargin(dbConn, *serviceArg, false)
	if err != nil {
		log.Printf("[WARNING] Invalid database state: %v", err)
	}

	_, _, err = GetCurrentTick(dbConn, false)
	if err != nil {
		log.Printf("[WARNING] Invalid database state: %v", err)
	}

	// Test various database permissions
	_, err = GetTaskCount(dbConn, serviceID, false)
	if err != nil {
		log.Printf("[ERROR] Database permission error: %v", err)
		os.Exit(1)
	}

	_, err = GetNewTasks(dbConn, serviceID, 1, false)
	if err != nil {
		log.Printf("[ERROR] Database permission error: %v", err)
		os.Exit(1)
	}

	_, err = GetFlagID(dbConn, serviceID, 1, 1, false, nil)
	if err != nil {
		log.Printf("[WARNING] Skipping startup GetFlagID check due to missing seed data or permissions: %v", err)
	}

	err = CommitResult(dbConn, serviceID, 1, 2147483647, 0, false, nil)
	if err != nil {
		log.Printf("[WARNING] Skipping startup CommitResult check due to missing seed data or permissions: %v", err)
	}

	err = SetFlagID(dbConn, serviceID, 1, 0, "id", false, nil)
	if err != nil {
		log.Printf("[WARNING] Skipping startup SetFlagID check due to missing seed data or permissions: %v", err)
	}

	_, err = LoadState(dbConn, serviceID, 1, "key", false)
	if err != nil {
		log.Printf("[WARNING] Skipping startup LoadState check due to missing seed data or permissions: %v", err)
	}

	err = StoreState(dbConn, serviceID, 1, "key", "data", false, nil)
	if err != nil {
		log.Printf("[WARNING] Skipping startup StoreState check due to missing seed data or permissions: %v", err)
	}

	log.Printf("[INFO] All database permission checks passed")

	// Initialize MasterLoop - try until database is in valid state
	var masterLoop *MasterLoop
	initStart := time.Now()
	for {
		masterLoop = NewMasterLoop(dbConn, *serviceArg, serviceID, *checkerScriptArg, *sudoUserArg,
			*stdDeviationsArg, *checkerCountArg, time.Duration(*intervalArg*float64(time.Second)),
			*ipPatternArg, flagSecret, loggingParams, metricsQueue)
		if masterLoop != nil {
			break
		}
		log.Printf("[INFO] Waiting for valid database state...")
		time.Sleep(60 * time.Second)
	}
	log.Printf("[INFO] MasterLoop initialized after %v, lastLaunch set to %v seconds ago", time.Since(initStart), time.Since(masterLoop.lastLaunch))

	// Setup graceful shutdown handler
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		<-sigChan
		log.Printf("[INFO] Shutting down, waiting for %d Checker Scripts to finish", masterLoop.getRunningScriptCount())
		masterLoop.shuttingDown = true
	}()

	// 11. Main loop
	for {
		masterLoop.step()
		if masterLoop.shuttingDown && masterLoop.getRunningScriptCount() == 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	log.Println("Checker Master shutdown complete")
}

// Hàm khởi tạo MasterLoop
func NewMasterLoop(dbConn *sql.DB, serviceSlug string, serviceID int, checkerScript, sudoUser string, stdDevCount float64, checkerCount int, interval time.Duration, ipPattern string, flagSecret []byte, loggingParams map[string]interface{}, metricsQueue chan interface{}) *MasterLoop {
	now := time.Now()
	m := &MasterLoop{
		dbConn:        dbConn,
		serviceSlug:   serviceSlug,
		serviceID:     serviceID,
		checkerScript: checkerScript,
		sudoUser:      sudoUser,
		stdDevCount:   stdDevCount,
		checkerCount:  checkerCount,
		interval:      interval,
		ipPattern:     ipPattern,
		flagSecret:    flagSecret,
		loggingParams: loggingParams,
		metricsQueue:  metricsQueue,
		knownTick:     -1,
		lastLaunch:    now.Add(-interval - 1*time.Second),
		supervisor:    NewRunnerSupervisor(metricsQueue),
	}
	log.Printf("[INFO] NewMasterLoop: now=%v, interval=%v, lastLaunch=%v", now, interval, m.lastLaunch)
	m.refreshControlInfo()
	return m
}

func (m *MasterLoop) refreshControlInfo() {
	controlInfo, _ := GetControlInfo(m.dbConn, false)
	m.contestStart = controlInfo.ContestStart
	m.tickDuration = time.Duration(controlInfo.TickDuration) * time.Second
	m.flagValidTicks = controlInfo.ValidTicks
	m.flagPrefix = controlInfo.FlagPrefix
}

func (m *MasterLoop) step() bool {
	// Lấy request từ Supervisor (Non-blocking qua channel)
	req := m.supervisor.GetRequest()
	if req != nil {
		var resp interface{}
		sendResp := true

		switch req.Action {
		case ActionFlag:
			log.Printf("ACTION_FLAG -> action = %s, info = %v, param = %v", req.Action, req.Info, req.Param)
			resp = m.handleFlagRequest(req.Info, req.Param)
		case ActionFlagID:
			log.Printf("ACTION_FLAGID -> action = %s, info = %v, param = %v", req.Action, req.Info, req.Param)
			SetFlagID(m.dbConn, m.serviceID, req.Info["team"].(int), req.Info["tick"].(int), req.Param.(string), false, nil)
		case ActionLoad:
			log.Printf("ACTION_LOAD -> action = %s, info = %v, param = %v", req.Action, req.Info, req.Param)
			var loadErr error
			resp, loadErr = LoadState(m.dbConn, m.serviceID, req.Info["team"].(int), req.Param.(string), false)
			if loadErr != nil {
				log.Printf("Error loading state: %v", loadErr)
			}
		case ActionStore:
			log.Printf("ACTION_STORE -> action = %s, info = %v, param = %v", req.Action, req.Info, req.Param)
			paramMap, ok := req.Param.(map[string]interface{})
			if !ok {
				log.Printf("Invalid STORE payload type from team %d: %T", req.Info["team"], req.Param)
				break
			}
			key, okKey := paramMap["key"].(string)
			data, okData := paramMap["data"].(string)
			if !okKey || !okData {
				log.Printf("Invalid STORE payload content from team %d: %v", req.Info["team"], req.Param)
				break
			}
			err := StoreState(m.dbConn, m.serviceID, req.Info["team"].(int), key, data, false, nil)
			if err != nil {
				log.Printf("Error storing state: %v", err)
			}
		case ActionResult:
			log.Printf("ACTION_RESULT -> action = %s, info = %v, param = %v", req.Action, req.Info, req.Param)
			m.handleResultRequest(req.Info, req.Param)
		default:
			log.Printf("Unknown action received từ team %d", req.Info["team"])
			m.supervisor.TerminateRunner(req.RunnerID)
			Inc(m.metricsQueue, "killed_tasks", map[string]string{})
			sendResp = false
		}

		if sendResp && req.Send != nil {
			req.Send <- resp // Gửi trả kết quả qua channel
		}
	}

	if !m.shuttingDown {
		now := time.Now()
		timeSinceLastLaunch := now.Sub(m.lastLaunch)

		if timeSinceLastLaunch >= m.interval {
			delay := timeSinceLastLaunch - m.interval
			Observe(m.metricsQueue, "task_launch_delay_seconds", delay.Seconds(), map[string]string{})
			Set(m.metricsQueue, "last_launch_timestamp", float64(now.Unix()), map[string]string{})

			m.lastLaunch = m.lastLaunch.Add(m.interval)
			m.launchTasks()
		}
	}

	return req != nil
}

func (m *MasterLoop) handleFlagRequest(taskInfo map[string]interface{}, param interface{}) interface{} {
	var tick int
	switch v := param.(type) {
	case string:
		parsedTick, err := strconv.Atoi(v)
		if err != nil {
			return nil
		}
		tick = parsedTick
	case float64:
		tick = int(v)
	case int:
		tick = v
	case map[string]interface{}:
		rawTick, exists := v["tick"]
		if !exists {
			return nil
		}
		switch tv := rawTick.(type) {
		case float64:
			tick = int(tv)
		case int:
			tick = tv
		case string:
			parsedTick, err := strconv.Atoi(tv)
			if err != nil {
				return nil
			}
			tick = parsedTick
		default:
			return nil
		}
	default:
		return nil
	}

	if tick == -1 {
		return nil
	}

	m.refreshControlInfo()
	flagID, err := GetFlagID(m.dbConn, m.serviceID, taskInfo["_team_id"].(int), tick, false, nil)
	if err != nil {
		return nil
	}
	expiration := m.contestStart.Add(time.Duration(tick+1) * m.tickDuration)

	log.Printf("contest_start= %v || valid_tick= %d || tick = %d", m.contestStart, m.flagValidTicks, tick)

	// Generate flag using lib
	return lib.Generate(expiration, uint32(flagID), uint16(taskInfo["team"].(int)), m.flagSecret, m.flagPrefix)
}

func (m *MasterLoop) handleResultRequest(taskInfo map[string]interface{}, param interface{}) {
	var result int
	switch v := param.(type) {
	case string:
		parsedResult, err := strconv.Atoi(v)
		if err != nil {
			log.Printf("Invalid result từ Checker Script team %d", taskInfo["team"])
			return
		}
		result = parsedResult
	case float64:
		result = int(v)
	case int:
		result = v
	default:
		log.Printf("Invalid result từ Checker Script team %d", taskInfo["team"])
		return
	}

	log.Printf("Result từ Checker Script team %d: %d", taskInfo["team"], result)
	// Gọi hàm commit result với proper error handling
	commitErr := CommitResult(m.dbConn, m.serviceID, taskInfo["team"].(int), taskInfo["tick"].(int), result, false, nil)
	if commitErr != nil {
		log.Printf("Error committing result: %v", commitErr)
	}
	// Report metric for completed task
	Inc(m.metricsQueue, "completed_tasks", map[string]string{"result": lib.CheckResult(result).String()})
}

func (m *MasterLoop) launchTasks() {
	log.Println("==> launch_tasks() called")

	currentTick, cancelChecks, err := GetCurrentTick(m.dbConn, false)
	if err != nil {
		log.Printf("Error getting current tick: %v", err)
		return
	}

	timeoutRunners := func() {
		terminated := m.supervisor.TerminateRunners()
		for _, taskInfo := range terminated {
			log.Printf("Forcefully terminated Checker Script cho team %d", taskInfo["team"])
			Inc(m.metricsQueue, "timeout_tasks", map[string]string{})
			err := CommitResult(m.dbConn, m.serviceID, taskInfo["team"].(int), taskInfo["tick"].(int), int(lib.Timeout), false, nil)
			if err != nil {
				log.Printf("Error committing timeout result: %v", err)
			}
		}
	}

	changeTick := func(newTick int) {
		timeoutRunners()
		m.updateLaunchParams(newTick)
		m.knownTick = newTick
	}

	if currentTick != m.knownTick {
		changeTick(currentTick)
	} else if cancelChecks {
		timeoutRunners()
		return
	}

	tasks, err := GetNewTasks(m.dbConn, m.serviceID, m.tasksPerLaunch, false)
	if err != nil {
		log.Printf("Error getting tasks: %v", err)
		return
	}
	if len(tasks) > 0 && tasks[0].Tick != currentTick {
		currentTick = tasks[0].Tick
		changeTick(currentTick)
	}

	for _, task := range tasks {
		// Construct IP by replacing placeholder with team number
		// Support both "192.168.199.%d" and direct "192.168.199." prefix patterns
		var ip string
		if strings.Contains(m.ipPattern, "%") {
			ip = fmt.Sprintf(m.ipPattern, task.TeamNetNo)
		} else {
			// If no format specifier, treat as prefix and append number
			ip = m.ipPattern + strconv.Itoa(task.TeamNetNo)
		}

		// Build runner arguments, prepend python3 for .py scripts
		var runnerArgs []string
		if strings.HasSuffix(m.checkerScript, ".py") {
			runnerArgs = []string{"python3", m.checkerScript, ip, strconv.Itoa(task.TeamNetNo), strconv.Itoa(task.Tick)}
		} else {
			runnerArgs = []string{m.checkerScript, ip, strconv.Itoa(task.TeamNetNo), strconv.Itoa(task.Tick)}
		}

		taskInfo := map[string]interface{}{
			"service":  m.serviceSlug,
			"team":     task.TeamNetNo,
			"_team_id": task.TeamID,
			"tick":     task.Tick,
		}

		log.Printf("Khởi chạy Checker Script cho team %d ở tick %d", task.TeamNetNo, task.Tick)
		m.supervisor.StartRunner(runnerArgs, m.sudoUser, taskInfo, m.loggingParams)
	}
}

func (m *MasterLoop) updateLaunchParams(tick int) {
	var checkDuration float64
	if tick < 5 {
		checkDuration = m.tickDuration.Seconds()
	} else {
		duration, err := GetCheckDuration(m.dbConn, m.serviceID, m.stdDevCount, false)
		if err != nil || duration == 0 {
			checkDuration = m.tickDuration.Seconds()
		} else {
			checkDuration = duration
		}
	}

	totalTasks, err := GetTaskCount(m.dbConn, m.serviceID, false)
	if err != nil {
		totalTasks = 1 // Default value
	}
	localTasks := float64(totalTasks) // Dùng math.Ceil tương tự Python
	marginSeconds, err := GetServiceMargin(m.dbConn, m.serviceSlug, false)
	if err != nil {
		marginSeconds = 5 // default value
	}

	launchTimeframe := math.Max(m.tickDuration.Seconds()-checkDuration-float64(marginSeconds), 0)
	intervalsPerTimeframe := math.Floor(launchTimeframe/m.interval.Seconds()) + 1
	m.tasksPerLaunch = int(math.Ceil(localTasks / intervalsPerTimeframe))

	log.Printf("Kế hoạch chạy %d tasks mỗi lượt. Max duration: %f giây", m.tasksPerLaunch, checkDuration)
	Set(m.metricsQueue, "tasks_per_launch_count", float64(m.tasksPerLaunch), map[string]string{})
	Set(m.metricsQueue, "max_task_duration_seconds", checkDuration, map[string]string{})
}

func (m *MasterLoop) getRunningScriptCount() int {
	return m.supervisor.GetProcessCount()
}

func setLogLevel(level string) {
	levels := map[string]string{
		"DEBUG":    "[DEBUG] ",
		"INFO":     "[INFO] ",
		"WARNING":  "[WARNING] ",
		"ERROR":    "[ERROR] ",
		"CRITICAL": "[CRITICAL] ",
	}
	prefix, exists := levels[level]
	if exists {
		log.SetPrefix(prefix)
	} else {
		log.SetPrefix("[INFO] ")
	}
}
