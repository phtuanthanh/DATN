package lib

import (
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func StartMetricsServer(host string, port int, network string, registry *prometheus.Registry) error {
	addr := fmt.Sprintf("%s:%d", host, port)

	// 1. Cấu hình Prometheus HTTP Handler
	var handler http.Handler
	if registry != nil {
		// Dùng Custom Registry nếu được truyền vào
		handler = promhttp.HandlerFor(registry, promhttp.HandlerOpts{})
	} else {
		// Dùng Default Registry (tương đương prometheus_client.REGISTRY trong Python)
		handler = promhttp.Handler()
	}

	// Tạo ServeMux và map đường dẫn /metrics
	mux := http.NewServeMux()
	mux.Handle("/metrics", handler)

	// 2. Tạo Listener với Address Family mong muốn (TCP4 hoặc TCP6)
	listener, err := net.Listen(network, addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s %s: %w", network, addr, err)
	}

	server := &http.Server{
		Handler: mux,
	}

	// 3. Chạy Server ngầm trong Goroutine (Tương đương daemon thread)
	go func() {
		// http.Server mặc định hoàn toàn im lặng (không log request), thỏa mãn SilentHandler.
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("Metrics server error: %v", err)
		}
	}()

	return nil
}
