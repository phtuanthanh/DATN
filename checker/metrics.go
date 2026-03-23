package main

import (
	"log"
	"net"
	"net/http"
	"strconv"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Khởi tạo một Registry dùng chung cho toàn bộ module
var registry = prometheus.NewRegistry()

// MetricsMessage là cấu trúc thông điệp để gửi vào channel
type MetricsMessage struct {
	Name        string
	Instruction string
	Value       float64
	Labels      map[string]string
}

// Các hàm Helpers.
// Lưu ý: Nếu queue là nil (thay thế cho DummyQueue ở Python), hàm sẽ return ngay lập tức.
func Inc(queue chan<- interface{}, name string, labels map[string]string) {
	if queue == nil {
		return
	}
	queue <- MetricsMessage{Name: name, Instruction: "inc", Value: 1, Labels: labels}
}

func Dec(queue chan<- interface{}, name string, labels map[string]string) {
	if queue == nil {
		return
	}
	queue <- MetricsMessage{Name: name, Instruction: "dec", Value: 1, Labels: labels}
}

func Set(queue chan<- interface{}, name string, value float64, labels map[string]string) {
	if queue == nil {
		return
	}
	queue <- MetricsMessage{Name: name, Instruction: "set", Value: value, Labels: labels}
}

func Observe(queue chan<- interface{}, name string, value float64, labels map[string]string) {
	if queue == nil {
		return
	}
	queue <- MetricsMessage{Name: name, Instruction: "observe", Value: value, Labels: labels}
}

// CheckerMetricsFactory khởi tạo và đăng ký các metrics
func CheckerMetricsFactory(service string) map[string]interface{} {
	metrics := make(map[string]interface{})
	prefix := "ctf_checkermaster_"

	// 1. Counters
	counters := map[string]string{
		"started_tasks": "Number of started Checker Script instances",
		"timeout_tasks": "Number of Checker Script instances forcibly terminated at end of tick",
		"killed_tasks":  "Number of Checker Script instances forcibly terminated because of misbehavior",
	}
	for name, doc := range counters {
		c := prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: prefix + name,
			Help: doc,
		}, []string{"service"})
		registry.MustRegister(c)
		c.WithLabelValues(service) // Pre-declare
		metrics[name] = c
	}

	completedTasks := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: prefix + "completed_tasks",
		Help: "Number of successfully completed checks",
	}, []string{"result", "service"})
	registry.MustRegister(completedTasks)
	metrics["completed_tasks"] = completedTasks

	// 2. Gauges
	gauges := map[string]string{
		"start_timestamp":           "(Unix) timestamp when the process was started",
		"interval_length_seconds":   "Configured launch interval length",
		"last_launch_timestamp":     "(Unix) timestamp when tasks were launched the last time",
		"tasks_per_launch_count":    "Number of checks to start in one launch interval",
		"max_task_duration_seconds": "Currently estimated maximum runtime of one check",
	}
	for name, doc := range gauges {
		g := prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: prefix + name,
			Help: doc,
		}, []string{"service"})
		registry.MustRegister(g)
		g.WithLabelValues(service)
		metrics[name] = g
	}

	// 3. Histograms
	histograms := []struct {
		name    string
		doc     string
		buckets []float64
	}{
		{"task_launch_delay_seconds", "Differences between supposed and actual task launch times", []float64{0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30, 60}},
		{"script_duration_seconds", "Observed runtimes of Checker Scripts", []float64{1, 3, 5, 8, 10, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300}},
	}
	for _, h := range histograms {
		hv := prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    prefix + h.name,
			Help:    h.doc,
			Buckets: h.buckets,
		}, []string{"service"})
		registry.MustRegister(hv)
		hv.WithLabelValues(service)
		metrics[h.name] = hv
	}

	return metrics
}

// RunCollector đọc dữ liệu từ channel và cập nhật Prometheus metrics
func RunCollector(service string, inQueue <-chan interface{}) {
	metrics := CheckerMetricsFactory(service)

	for msgRaw := range inQueue {
		msg, ok := msgRaw.(MetricsMessage)
		if !ok {
			log.Println("Received unknown message type on collector channel")
			continue
		}

		metric, exists := metrics[msg.Name]
		if !exists {
			log.Printf("Received message for unknown metric %q, ignoring\n", msg.Name)
			continue
		}

		labels := msg.Labels
		if labels == nil {
			labels = make(map[string]string)
		}
		labels["service"] = service

		// Cập nhật metric dựa trên instruction
		switch m := metric.(type) {
		case *prometheus.CounterVec:
			c, err := m.GetMetricWith(labels)
			if err != nil {
				log.Printf("Invalid labels for metric %q: %v\n", msg.Name, err)
				continue
			}
			if msg.Instruction == "inc" {
				c.Add(msg.Value)
			}

		case *prometheus.GaugeVec:
			g, err := m.GetMetricWith(labels)
			if err != nil {
				log.Printf("Invalid labels for metric %q: %v\n", msg.Name, err)
				continue
			}
			switch msg.Instruction {
			case "set":
				g.Set(msg.Value)
			case "inc":
				g.Add(msg.Value)
			case "dec":
				g.Sub(msg.Value)
			}

		case *prometheus.HistogramVec:
			h, err := m.GetMetricWith(labels)
			if err != nil {
				log.Printf("Invalid labels for metric %q: %v\n", msg.Name, err)
				continue
			}
			if msg.Instruction == "observe" {
				h.Observe(msg.Value)
			}
		default:
			log.Printf("Cannot use instruction %q on metric %q\n", msg.Instruction, msg.Name)
		}
	}
}

// RunHTTPServer chạy một máy chủ HTTP để expose metrics tại endpoint /metrics
// Không cần Pipe như Python nữa vì Thư viện Go trực tiếp đọc từ bộ nhớ an toàn.
func RunHTTPServer(host string, port int) {
	addr := net.JoinHostPort(host, strconv.Itoa(port))

	mux := http.NewServeMux()
	// Expose registry trực tiếp bằng promhttp.HandlerFor
	mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))

	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	log.Printf("Starting metrics HTTP server on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("Metrics HTTP server failed: %v", err)
	}
}
