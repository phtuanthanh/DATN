import requests
import json
import psycopg2
import os
from dotenv import load_dotenv

URL_WIREGUARD = 'https://wireguard.n3m3s1s.org'

USERNAME = 'admin'
PASSWORD = 'N3m3s1sPassw0rd123@'
REMEMBER = False

ExpiresAt = "2028-06-04T00:00:00.000Z"

E_LOGIN = '/api/session'
E_CRE_TEAMS = '/api/client'

VPN_CONFIG_DIR = './data/vpn-config/vulnbox'

# Load environment variables
load_dotenv()


# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'ctf_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'password')
}

class DatabaseConnector:
    """Handle database connections and queries"""
    
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
            print("✓ Database connection established")
            return True
        except Exception as e:
            print(f"✗ Database connection error: {e}")
            return False
    
    def disconnect(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("✓ Database connection closed")
    
    def query(self, sql, params=None):
        """Execute a query and return results"""
        try:
            if params:
                self.cursor.execute(sql, params)
            else:
                self.cursor.execute(sql)
            
            # Check if it's a SELECT query
            if sql.strip().upper().startswith('SELECT'):
                return self.cursor.fetchall()
            else:
                # For INSERT, UPDATE, DELETE
                self.conn.commit()
                return self.cursor.rowcount
        except Exception as e:
            print(f"✗ Query error: {e}")
            return None

def save_vpn_config(config_content, team_slug, team_id):
    """Save VPN configuration to file and return file path"""
    try:
        os.makedirs(VPN_CONFIG_DIR, exist_ok=True)
        
        file_path = os.path.join(VPN_CONFIG_DIR, f"{team_slug}.conf")
        
        # Save configuration content (text or JSON)
        with open(file_path, 'w', encoding='utf-8') as f:
            if isinstance(config_content, str):
                f.write(config_content)
            else:
                f.write(json.dumps(config_content, indent=2))
        
        print(f"  ✓ Saved client config: {file_path}")
        return file_path
    except Exception as e:
        print(f"  ✗ Error saving config: {e}")
        return None


def update_vpn_team_path(db_conn, team_id, file_path, ip_address):
    """Update VPNTeams table with config file path and IP address"""
    try:
        result = db_conn.query(
            'UPDATE "vpn_teams" SET path = %s, "ipVpn" = %s WHERE "idTeam" = %s AND "typeVpn" = true',
            (file_path, ip_address, team_id)
        )
        if result and result > 0:
            print(f"  ✓ Updated vpn_teams for team {team_id}: path={file_path}, ipVpn={ip_address}")
            return True
        else:
            print(f"  ⚠ No vpn_teams record updated for team {team_id} (typeVpn=true)")
            return False
    except Exception as e:
        print(f"  ✗ Error updating vpn_teams: {e}")
        return False

# Initialize database connector
db = DatabaseConnector(DB_CONFIG)

if not db.connect():
    print("✗ Failed to connect to database")
    exit(1)

# Get teams with both ID and slug_team
teams = db.query("SELECT id, slug_team FROM teams")

if not teams:
    print("✗ No teams found in database")
    db.disconnect()
    exit(1)

print(f"Processing {len(teams)} teams...\n")
# Initialize WireGuard session with login
session = requests.Session()
login_response = session.post(
    URL_WIREGUARD + E_LOGIN,
    json={
        'username': USERNAME,
        'password': PASSWORD,
        'remember': REMEMBER
    }
)

if login_response.status_code != 200:
    print(f"✗ Failed to login to WireGuard: {login_response.status_code}")
    db.disconnect()
    exit(1)

print("✓ WireGuard login successful\n")

# First pass: Create VPN clients with _vuln suffix
print("Creating VPN clients...")
for team in teams:
    team_id, team_slug = team[0], team[1]
    vulnbox_name = team_slug + "_vuln"
    r = session.post(
        URL_WIREGUARD + E_CRE_TEAMS,
        json={'name': vulnbox_name, 'expiresAt': ExpiresAt}
    )
    if r.status_code == 201:
        print(f"  ✓ Created: {vulnbox_name}")
    else:
        print(f"  ⚠ Status {r.status_code}: {vulnbox_name}")

print()

# Second pass: Save configurations and update database
print("Processing VPN configurations...\n")
for team in teams:
    team_id, team_slug = team[0], team[1]
    vulnbox_name = team_slug + "_vuln"
    print(f"Processing team: {vulnbox_name} (ID: {team_id})")
    
    # Get all VPN clients from WireGuard
    try:
        response = session.get(URL_WIREGUARD + E_CRE_TEAMS)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"  ✗ Failed to fetch clients: {e}")
        continue
    
    # Extract clients list
    clients = data.get('clients', []) if isinstance(data, dict) else data
    
    # Find VPN clients matching this team
    matched_clients = []
    for client in clients:
        client_name = client.get('name', '')
        client_id = client.get('id')
        ipv4_address = client.get('ipv4Address')
        
        # Check if client name matches vulnbox name
        if vulnbox_name.lower() in client_name.lower():
            matched_clients.append({'id': client_id, 'name': client_name, 'ipv4': ipv4_address, 'client': client})
            print(f"  ✓ Found client: {client_name} (ID: {client_id}, IPv4: {ipv4_address})")
    
    # Save configuration for each matched client
    for client in matched_clients:
        client_id = client['id']
        client_name = client['name']
        ip_address = client['ipv4']
        
        print(f"    Processing {client_name}...")
        
        if ip_address:
            print(f"    ✓ IP Address: {ip_address}")
        else:
            print(f"    ⚠ No IPv4 address found")
            ip_address = None
        
        # Fetch client configuration from API
        try:
            config_response = session.get(
                URL_WIREGUARD + f'/api/client/{str(client_id)}/configuration'
            )
            config_response.raise_for_status()
            config_text = config_response.text
            
            print(f"    ✓ Fetched configuration from API")
            
            # Save client configuration to file
            file_path = save_vpn_config(config_text, vulnbox_name, team_id)
            if not file_path:
                continue
            
            # Update database with file path and IP (only for typeVpn=true)
            update_vpn_team_path(db, team_id, file_path, ip_address)
        except Exception as e:
            print(f"    ✗ Failed to fetch configuration for {client_name}: {e}")
            continue
    
    print()

db.disconnect()
print("✓ VPN vulnbox sync completed")
