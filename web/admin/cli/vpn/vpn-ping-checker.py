import psycopg2
import subprocess
import os
import sys
import time
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'ctf_db'),
    'user': os.getenv('DB_USER', 'hades'),
    'password': os.getenv('DB_PASSWORD', 'lgedv2024')
}

class VPNPingChecker:
    """Check VPN connection status by pinging IPs"""
    
    def __init__(self, config):
        self.config = config
        self.conn = None
        self.cursor = None
    
    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(
                host=self.config['host'],
                port=self.config['port'],
                database=self.config['database'],
                user=self.config['user'],
                password=self.config['password']
            )
            self.cursor = self.conn.cursor()
            print(f"[{datetime.now()}] Connected to database successfully")
        except Exception as e:
            print(f"[ERROR] Failed to connect to database: {e}")
            sys.exit(1)
    
    def disconnect(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print(f"[{datetime.now()}] Disconnected from database")
    
    def ping_ip(self, ip):
        """Ping an IP address and return status"""
        try:
            # Use ping with timeout (1 second) and 1 packet
            result = subprocess.run(
                ['ping', '-c', '1', '-W', '1', ip],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3
            )
            
            if result.returncode == 0:
                return 'online'
            else:
                return 'offline'
        except subprocess.TimeoutExpired:
            return 'timeout'
        except Exception as e:
            print(f"[ERROR] Ping error for {ip}: {e}")
            return 'error'
    
    def get_all_vpn_configs(self):
        """Get all VPN configs from both vpn_teams and vpn_users tables"""
        results = []
        try:
            # Get from vpn_teams
            query_teams = "SELECT id, \"nameVpn\", \"ipVpn\", 'vpn_teams' as table_name FROM vpn_teams WHERE \"ipVpn\" IS NOT NULL AND \"ipVpn\" != ''"
            self.cursor.execute(query_teams)
            results.extend(self.cursor.fetchall())
            
            # Get from vpn_users
            query_users = "SELECT id, \"nameVpn\", \"ipVpn\", 'vpn_users' as table_name FROM vpn_users WHERE \"ipVpn\" IS NOT NULL AND \"ipVpn\" != ''"
            self.cursor.execute(query_users)
            results.extend(self.cursor.fetchall())
            
            return results
        except Exception as e:
            print(f"[ERROR] Failed to fetch VPN configs: {e}")
            return []
    
    def update_vpn_status(self, vpn_id, status, table_name):
        """Update VPN status in database"""
        try:
            query = f"UPDATE {table_name} SET \"statusVpn\" = %s, \"updatedAt\" = NOW() WHERE id = %s"
            self.cursor.execute(query, (status, vpn_id))
            self.conn.commit()
        except Exception as e:
            print(f"[ERROR] Failed to update status for VPN ID {vpn_id} in {table_name}: {e}")
            self.conn.rollback()
    
    def check_all_vpns(self):
        """Check all VPN connections"""
        vpn_configs = self.get_all_vpn_configs()
        
        if not vpn_configs:
            print(f"[{datetime.now()}] No VPN configs found with IP addresses")
            return
        
        print(f"[{datetime.now()}] Found {len(vpn_configs)} VPN configs to check")
        
        for vpn_id, name, ip, table_name in vpn_configs:
            print(f"[{datetime.now()}] Checking {name} ({ip}) [{table_name}]...", end=" ")
            status = self.ping_ip(ip)
            print(f"Status: {status}")
            self.update_vpn_status(vpn_id, status, table_name)
        
        print(f"[{datetime.now()}] All VPN configs checked successfully")

def main():
    checker = VPNPingChecker(DB_CONFIG)
    
    try:
        # Chỉ kết nối Database một lần duy nhất khi khởi động script
        checker.connect()
        
        # Chạy vòng lặp vô hạn
        while True:
            checker.check_all_vpns()
            print(f"[{datetime.now()}] Sleeping for 5 seconds...\n")
            
            # Tạm dừng 5 giây để tối ưu băng thông và tài nguyên
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\n[INFO] Process interrupted by user")
    except Exception as e:
        print(f"[ERROR] An error occurred: {e}")
    finally:
        # Chỉ ngắt kết nối Database khi service bị dừng hoàn toàn
        checker.disconnect()

if __name__ == "__main__":
    main()