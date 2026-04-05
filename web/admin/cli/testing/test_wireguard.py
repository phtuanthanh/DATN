#!/usr/bin/env python3
"""
Test Wireguard connectivity
"""
import sys
import json
import subprocess
from datetime import datetime

def log(level, message):
    """Print log in JSON format"""
    print(json.dumps({
        "level": level,
        "message": message,
        "timestamp": datetime.now().isoformat()
    }))

def test_wireguard():
    """Test Wireguard status and connectivity"""
    try:
        log("info", "Starting Wireguard test...")
        
        # Step 1: curl to https://wireguard.n3m3s1s.org
        log("info", "Step 1: Testing connection to https://wireguard.n3m3s1s.org...")
        try:
            result = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', 
                                   'https://wireguard.n3m3s1s.org', '--max-time', '5'],
                                  capture_output=True, text=True, timeout=10)
            http_code = result.stdout.strip()
            
            if result.returncode == 0 and http_code in ['200', '301', '302', '403', '404']:
                log("success", f"✓ Successfully connected to wireguard.n3m3s1s.org (HTTP {http_code})")
                
                # Step 2: Check if wg interface is enabled
                log("info", "Step 2: Checking Wireguard interface status...")
                try:
                    result = subprocess.run(['ip', 'link', 'show', 'type', 'wireguard'], 
                                          capture_output=True, text=True, timeout=3)
                    if result.returncode == 0 and result.stdout.strip():
                        # Check if interface is UP
                        if 'UP' in result.stdout:
                            log("success", "✓ Wireguard interface is UP and enabled")
                        else:
                            log("info", "ℹ Wireguard interface found but currently DOWN")
                            log("info", result.stdout.strip())
                    else:
                        log("warning", "⚠ No Wireguard interfaces found")
                except Exception as e:
                    log("warning", f"⚠ Could not check wg interface: {str(e)}")
                
                # Step 3: Ping to 192.168.199.2
                log("info", "Step 3: Pinging 192.168.199.2...")
                try:
                    result = subprocess.run(['ping', '-c', '1', '-W', '2', '192.168.199.2'],
                                          capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        log("success", "✓ Successfully pinged 192.168.199.2")
                    else:
                        log("warning", "⚠ Could not ping 192.168.199.2")
                except Exception as e:
                    log("warning", f"⚠ Ping to 192.168.199.2 failed: {str(e)}")
                
                # Step 4: Ping to 192.168.199.1
                log("info", "Step 4: Pinging 192.168.199.1...")
                try:
                    result = subprocess.run(['ping', '-c', '1', '-W', '2', '192.168.199.1'],
                                          capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        log("success", "✓ Successfully pinged 192.168.199.1")
                    else:
                        log("warning", "⚠ Could not ping 192.168.199.1")
                except Exception as e:
                    log("warning", f"⚠ Ping to 192.168.199.1 failed: {str(e)}")
                    
            else:
                log("error", f"✗ Connection to wireguard.n3m3s1s.org failed (HTTP {http_code})")
                return 1
                
        except subprocess.TimeoutExpired:
            log("error", "✗ Connection to wireguard.n3m3s1s.org timed out")
            return 1
        except FileNotFoundError:
            log("error", "✗ curl command not found on this system")
            return 1
        except Exception as e:
            log("error", f"✗ Connection test failed: {str(e)}")
            return 1
        
        log("success", "Wireguard test completed!")
        return 0
        
    except Exception as e:
        log("error", f"✗ Test failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(test_wireguard())
