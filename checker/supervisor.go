package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"time"
)

// Request đại diện cho thông điệp gửi từ Runner lên Master
type Request struct {
	Action   string
	Param    interface{}
	RunnerID string
	Info     map[string]interface{}
	Send     chan interface{} // Channel để Master gửi phản hồi lại Runner
}

// runnerState lưu trữ trạng thái của một Runner đang chạy
type runnerState struct {
	cmd    *exec.Cmd
	info   map[string]interface{}
	cancel chan struct{} // Dùng để báo hiệu terminate
}

// RunnerSupervisor quản lý các tiến trình Checker Script
type RunnerSupervisor struct {
	metricsQueue chan interface{}
	workQueue    chan *Request

	mu      sync.Mutex
	runners map[string]*runnerState
	nextID  int
}

// NewRunnerSupervisor khởi tạo một Supervisor mới
func NewRunnerSupervisor(metricsQueue chan interface{}) *RunnerSupervisor {
	return &RunnerSupervisor{
		metricsQueue: metricsQueue,
		workQueue:    make(chan *Request, 100), // Buffer cho requests
		runners:      make(map[string]*runnerState),
	}
}

// GetProcessCount trả về số lượng Checker Script đang chạy
func (s *RunnerSupervisor) GetProcessCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.runners)
}

// StartRunner khởi chạy một Checker Script mới
func (s *RunnerSupervisor) StartRunner(args []string, sudoUser string, info map[string]interface{}, loggingParams map[string]interface{}) {
	s.mu.Lock()
	runnerID := strconv.Itoa(s.nextID)
	s.nextID++
	s.mu.Unlock()

	log.Printf("Khởi chạy Runner %s, info: %v", runnerID, info)

	// Khởi chạy goroutine thay thế cho multiprocessing.Process của Python
	go s.runCheckerScript(args, sudoUser, info, loggingParams, runnerID)
}

// TerminateRunner buộc dừng một Checker Script
func (s *RunnerSupervisor) TerminateRunner(runnerID string) {
	s.mu.Lock()
	runner, exists := s.runners[runnerID]
	s.mu.Unlock()

	if exists {
		log.Printf("Bắt buộc dừng Runner %s, info: %v", runnerID, runner.info)
		// Gửi tín hiệu SIGKILL vào Process Group
		if runner.cmd.Process != nil {
			_ = syscall.Kill(-runner.cmd.Process.Pid, syscall.SIGKILL)
		}
	}
}

// TerminateRunners dừng tất cả các script đang chạy và trả về danh sách Info
func (s *RunnerSupervisor) TerminateRunners() []map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	var terminated []map[string]interface{}
	for id, runner := range s.runners {
		log.Printf("Bắt buộc dừng Runner %s", id)
		if runner.cmd.Process != nil {
			_ = syscall.Kill(-runner.cmd.Process.Pid, syscall.SIGKILL)
		}
		terminated = append(terminated, runner.info)
	}
	return terminated
}

// GetRequest lấy request tiếp theo từ hàng đợi (Non-blocking)
func (s *RunnerSupervisor) GetRequest() *Request {
	select {
	case req := <-s.workQueue:
		if req.Action == ActionRunnerExit {
			// Dọn dẹp Runner khỏi map khi nhận được tín hiệu thoát
			s.mu.Lock()
			delete(s.runners, req.RunnerID)
			s.mu.Unlock()
			return nil
		}
		return req
	default:
		return nil
	}
}

// --- Internal Runner Logic ---

func (s *RunnerSupervisor) runCheckerScript(args []string, sudoUser string, info map[string]interface{}, loggingParams map[string]interface{}, runnerID string) {
	startTime := time.Now()

	// Khởi tạo các Pipes (Tương đương os.pipe() trong Python)
	ctrlInReader, ctrlInWriter, _ := os.Pipe()
	ctrlOutReader, ctrlOutWriter, _ := os.Pipe()

	defer ctrlInWriter.Close()
	defer ctrlOutReader.Close()

	// Chuẩn bị câu lệnh
	var cmd *exec.Cmd
	// Skip sudo if sudoUser is "root" or empty, since checker runs as root
	if sudoUser != "" && sudoUser != "root" {
		sudoArgs := append([]string{"--user=" + sudoUser, "--preserve-env=PATH,CTF_CHECKERSCRIPT", "--non-interactive", "--"}, args...)
		cmd = exec.Command("sudo", sudoArgs...)
	} else {
		cmd = exec.Command(args[0], args[1:]...)
	}

	cmd.Env = append(os.Environ(), "CTF_CHECKERSCRIPT=1")

	// Add service name from info map
	if service, ok := info["service"].(string); ok {
		cmd.Env = append(cmd.Env, fmt.Sprintf("CTF_SERVICE=%s", service))
	}

	// Cấu hình ExtraFiles: Python gán fd 3 và fd 4 bằng hàm preexec_fn dup2.
	// Golang hỗ trợ trực tiếp việc này thông qua ExtraFiles.
	// fd 0: stdin, fd 1: stdout, fd 2: stderr
	// fd 3: ctrlInReader (Script đọc từ đây), fd 4: ctrlOutWriter (Script ghi vào đây)
	cmd.ExtraFiles = []*os.File{ctrlInReader, ctrlOutWriter}

	// Đặt setpgid = true để dễ dàng SIGKILL toàn bộ group (tránh child process mồ côi)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	// Đọc Stdout và Stderr trực tiếp
	stdoutPipe, _ := cmd.StdoutPipe()
	stderrPipe, _ := cmd.StderrPipe()

	// Lưu trữ trạng thái
	state := &runnerState{cmd: cmd, info: info, cancel: make(chan struct{})}
	s.mu.Lock()
	s.runners[runnerID] = state
	s.mu.Unlock()

	// Bắt đầu thực thi
	if err := cmd.Start(); err != nil {
		log.Printf("[RUNNER %s] Lỗi khởi chạy script: %v", runnerID, err)
		return
	}

	// Đóng các đầu file descriptor không dùng trong goroutine cha để tránh rò rỉ
	ctrlInReader.Close()
	ctrlOutWriter.Close()

	var wg sync.WaitGroup

	// Goroutine đọc Log (Stdout/Stderr)
	logStream := func(stream io.Reader, streamName string) {
		wg.Add(1)
		defer wg.Done()
		scanner := bufio.NewScanner(stream)
		for scanner.Scan() {
			log.Printf("[SCRIPT %s] %s", streamName, scanner.Text())
			// Tại đây bạn có thể cấu hình đẩy log ra Journald/Gelf dựa trên loggingParams
		}
	}
	go logStream(stdoutPipe, "STDOUT")
	go logStream(stderrPipe, "STDERR")

	// Goroutine xử lý Control Channel (Giao tiếp JSON)
	wg.Add(1)
	go func() {
		defer wg.Done()
		decoder := json.NewDecoder(ctrlOutReader)
		for {
			var msg map[string]interface{}
			if err := decoder.Decode(&msg); err != nil {
				if err != io.EOF {
					log.Printf("[RUNNER %s] Lỗi decode JSON từ script: %v", runnerID, err)
				}
				break
			}
			s.handleScriptMessage(msg, ctrlInWriter, runnerID, info)
		}
	}()

	// Chờ đợi Script kết thúc và dọn dẹp
	err := cmd.Wait()
	wg.Wait() // Chờ tất cả I/O kết thúc

	duration := time.Since(startTime)
	// (Giả định) Gửi metrics
	// metrics.Observe(s.metricsQueue, "script_duration_seconds", duration.Seconds())

	log.Printf("[RUNNER %s] Checker Script thoát với lỗi: %v, Thời gian chạy: %v", runnerID, err, duration)

	// Báo cho Master biết Runner đã xong
	s.workQueue <- &Request{
		Action:   ActionRunnerExit,
		RunnerID: runnerID,
	}
}

// handleScriptMessage xử lý từng thông điệp JSON nhận từ Checker Script
func (s *RunnerSupervisor) handleScriptMessage(msg map[string]interface{}, ctrlInWriter io.Writer, runnerID string, info map[string]interface{}) {
	actionRaw, okAction := msg["action"].(string)
	param, okParam := msg["param"]

	if !okAction || !okParam {
		log.Printf("[RUNNER %s] Message thiếu key 'action' hoặc 'param': %v", runnerID, msg)
		return
	}

	if actionRaw == ActionRunnerExit {
		log.Printf("[RUNNER %s] Message không được phép gọi RUNNER_EXIT: %v", runnerID, msg)
		return
	}

	// Xử lý ghi log nhanh
	if actionRaw == ActionLog {
		if paramMap, ok := param.(map[string]interface{}); ok {
			if msg, ok := paramMap["message"]; ok {
				log.Printf("%v", msg)
			}
		}
		return
	}

	// Tạo channel riêng để nhận phản hồi từ Master
	replyChan := make(chan interface{}, 1)

	// Gửi request lên Master qua workQueue
	s.workQueue <- &Request{
		Action:   actionRaw,
		Param:    param,
		RunnerID: runnerID,
		Info:     info,
		Send:     replyChan,
	}

	// Chờ Master phản hồi
	response := <-replyChan

	// Mã hóa JSON trả về cho Script
	replyData := map[string]interface{}{"response": response}
	jsonData, err := json.Marshal(replyData)
	if err != nil {
		log.Printf("[RUNNER %s] Lỗi encode JSON trả về: %v", runnerID, err)
		return
	}

	jsonData = append(jsonData, '\n')
	_, err = ctrlInWriter.Write(jsonData)
	if err != nil {
		log.Printf("[RUNNER %s] Lỗi ghi pipe trả về: %v", runnerID, err)
	}
}
