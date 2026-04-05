#!/usr/bin/env python3
"""
Test connectivity to all CTF services
Reads configuration from environment variables
"""
import os
import sys
import json
import socket
import subprocess
from datetime import datetime

def log(level, message):
    """Print log in JSON format"""
    print(json.dumps({
        "level": level,
        "message": message,
        "timestamp": datetime.now().isoformat()
    }))

def get_env_config():
    """Get service configuration from environment variables"""
    config = {
        'submission_host': os.getenv('SUBMISSION_HOST', 'localhost'),
        'submission_port': int(os.getenv('SUBMISSION_PORT', 6666)),
        'checker_host': os.getenv('CHECKER_HOST', 'localhost'),
        'controller_host': os.getenv('CONTROLLER_HOST', 'localhost'),
        'db_host': os.getenv('DB_HOST', 'localhost'),
        'db_port': int(os.getenv('DB_PORT', 5432)),
        'db_name': os.getenv('DB_NAME', 'ad_challenge'),
        'db_user': os.getenv('DB_USER', 'postgres'),
        'db_password': os.getenv('DB_PASSWORD', 'password'),
    }
    return config

def test_submission(host, port):
    """Test submission server with nc"""
    try:
        log("info", f"Testing SUBMISSION: {host}:{port}")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            log("success", f"✓ SUBMISSION server is reachable at {host}:{port}")
            return True
        else:
            log("error", f"✗ SUBMISSION server unreachable at {host}:{port}")
            return False
    except Exception as e:
        log("error", f"✗ SUBMISSION test failed: {str(e)}")
        return False

def test_checker(host):
    """Test checker with ping"""
    try:
        log("info", f"Testing CHECKER: {host}")
        result = subprocess.run(
            ['ping', '-c', '1', '-W', '2', host],
            capture_output=True,
            timeout=5
        )
        
        if result.returncode == 0:
            log("success", f"✓ CHECKER host is reachable at {host}")
            return True
        else:
            log("warning", f"⚠ CHECKER host unreachable at {host} (no ping response)")
            return False
    except FileNotFoundError:
        log("warning", "⚠ 'ping' command not found, skipping CHECKER ping test")
        return None
    except Exception as e:
        log("error", f"✗ CHECKER test failed: {str(e)}")
        return False

def test_controller(host):
    """Test controller with ping"""
    try:
        log("info", f"Testing CONTROLLER: {host}")
        result = subprocess.run(
            ['ping', '-c', '1', '-W', '2', host],
            capture_output=True,
            timeout=5
        )
        
        if result.returncode == 0:
            log("success", f"✓ CONTROLLER host is reachable at {host}")
            return True
        else:
            log("warning", f"⚠ CONTROLLER host unreachable at {host} (no ping response)")
            return False
    except FileNotFoundError:
        log("warning", "⚠ 'ping' command not found, skipping CONTROLLER ping test")
        return None
    except Exception as e:
        log("error", f"✗ CONTROLLER test failed: {str(e)}")
        return False

def test_database(host, port, name, user, password):
    """Test database connection with psql"""
    try:
        log("info", f"Testing DATABASE: {user}@{host}:{port}/{name}")
        
        # First try with socket timeout
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        sock_result = sock.connect_ex((host, port))
        sock.close()
        
        if sock_result != 0:
            log("error", f"✗ DATABASE port {port} is not open at {host}")
            return False
        
        log("info", "Database port is open, attempting psql connection...")
        
        # Try psql connection
        env = os.environ.copy()
        env['PGPASSWORD'] = password
        
        result = subprocess.run(
            ['psql', '-h', host, '-p', str(port), '-U', user, '-d', name, 
             '-c', 'SELECT 1;'],
            capture_output=True,
            timeout=5,
            env=env
        )
        
        if result.returncode == 0:
            log("success", f"✓ DATABASE connection successful")
            return True
        else:
            error_msg = result.stderr.decode().strip()
            log("error", f"✗ DATABASE connection failed: {error_msg}")
            return False
            
    except FileNotFoundError:
        log("warning", "⚠ 'psql' command not found, skipping database connection test")
        return None
    except subprocess.TimeoutExpired:
        log("error", "✗ DATABASE connection timeout")
        return False
    except Exception as e:
        log("error", f"✗ DATABASE test failed: {str(e)}")
        return False

def test_all_services():
    """Test all services"""
    try:
        log("info", "Starting infrastructure connectivity test...")
        log("info", "=" * 60)
        
        config = get_env_config()
        log("info", f"Configuration: {json.dumps({k: v for k, v in config.items() if k != 'db_password'})}")
        
        log("info", "=" * 60)
        
        results = {}
        
        # Test SUBMISSION
        log("info", "")
        results['submission'] = test_submission(config['submission_host'], config['submission_port'])
        
        # Test CHECKER
        log("info", "")
        results['checker'] = test_checker(config['checker_host'])
        
        # Test CONTROLLER
        log("info", "")
        results['controller'] = test_controller(config['controller_host'])
        
        # Test DATABASE
        log("info", "")
        results['database'] = test_database(
            config['db_host'],
            config['db_port'],
            config['db_name'],
            config['db_user'],
            config['db_password']
        )
        
        log("info", "=" * 60)
        
        # Summary
        passed = sum(1 for v in results.values() if v is True)
        failed = sum(1 for v in results.values() if v is False)
        skipped = sum(1 for v in results.values() if v is None)
        
        log("info", f"Results: {passed} passed, {failed} failed, {skipped} skipped")
        
        if failed > 0:
            log("error", "⚠ Some services are not reachable")
            return 1
        else:
            log("success", "✓ All services are reachable!")
            return 0
        
    except Exception as e:
        log("error", f"✗ Test suite failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(test_all_services())
