package lib

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// Config chứa các cấu hình trả về từ parser
type Config struct {
	LogLevel   string
	DBHost     string
	DBName     string
	DBUser     string
	DBPassword string
}

// GetConfigWithDB thay thế cho get_arg_parser_with_db.
// Go thường parse flag thẳng vào struct thay vì trả về một parser object.
func GetConfigWithDB() (*Config, error) {
	cfg := &Config{}

	// Thiết lập Custom Usage để chứa Description như trong Python
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "Gameserver database configuration\n\n")
		flag.PrintDefaults()
	}

	// Helper function để lấy giá trị từ biến môi trường hoặc dùng default
	getEnv := func(key, fallback string) string {
		if value, exists := os.LookupEnv(key); exists {
			return value
		}
		return fallback
	}

	// Định nghĩa các flags, mặc định lấy từ biến môi trường (tiền tố CTF_) nếu có
	flag.StringVar(&cfg.LogLevel, "loglevel", getEnv("CTF_LOGLEVEL", "WARNING"), "Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL")
	flag.StringVar(&cfg.DBHost, "dbhost", getEnv("CTF_DBHOST", ""), "Hostname of the database. If unspecified, the default Unix socket will be used.")
	flag.StringVar(&cfg.DBName, "dbname", getEnv("CTF_DBNAME", ""), "Name of the used database (Required)")
	flag.StringVar(&cfg.DBUser, "dbuser", getEnv("CTF_DBUSER", ""), "User name for database access (Required)")
	flag.StringVar(&cfg.DBPassword, "dbpassword", getEnv("CTF_DBPASSWORD", ""), "Password for database access if needed")

	flag.Parse()

	// Validate Choices cho Loglevel
	validLogLevels := map[string]bool{"DEBUG": true, "INFO": true, "WARNING": true, "ERROR": true, "CRITICAL": true}
	if !validLogLevels[strings.ToUpper(cfg.LogLevel)] {
		return nil, fmt.Errorf("invalid loglevel: %s", cfg.LogLevel)
	}

	// Validate Required fields
	if cfg.DBName == "" {
		return nil, errors.New("--dbname is required")
	}
	if cfg.DBUser == "" {
		return nil, errors.New("--dbuser is required")
	}

	return cfg, nil
}

// ParseHostPort thay thế cho parse_host_port.
// Trả về host (string), port (int), family (int - syscall constants) và error.
func ParseHostPort(text string) (string, int, int, error) {
	// Dùng thư viện net chuẩn của Go thay vì trick bằng urllib
	host, portStr, err := net.SplitHostPort(text)
	if err != nil {
		return "", 0, 0, fmt.Errorf("invalid host or port: %w", err)
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return "", 0, 0, fmt.Errorf("invalid port format: %w", err)
	}

	// Phân giải tên miền để lấy IP (giống socket.getaddrinfo)
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return "", 0, 0, fmt.Errorf("could not determine address family: %w", err)
	}

	// Xác định Address Family từ IP đầu tiên (syscall.AF_INET cho IPv4, syscall.AF_INET6 cho IPv6)
	family := syscall.AF_INET // Mặc định là IPv4 (tương đương socket.AF_INET)
	if ips[0].To4() == nil {
		family = syscall.AF_INET6 // Nếu không phải IPv4 thì là IPv6
	}

	return host, port, family, nil
}
