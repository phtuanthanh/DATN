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
E_CRE_USERS = '/api/client'

VPN_CONFIG_DIR = './data/vpn-config/user'

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

def save_vpn_config(config_content, user_slug, user_id):
    """Save VPN configuration to file and return file path"""
    try:
        os.makedirs(VPN_CONFIG_DIR, exist_ok=True)
        
        file_path = os.path.join(VPN_CONFIG_DIR, f"{user_slug}.conf")
        
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


def update_vpn_user_path(db_conn, user_id, team_id, file_path, ip_address):
    """Update vpn_users table with config file path and IP address"""
    try:
        result = db_conn.query(
            'UPDATE "vpn_users" SET path = %s, "ipVpn" = %s WHERE "idUser" = %s AND "idTeam" = %s',
            (file_path, ip_address, user_id, team_id)
        )
        if result and result > 0:
            print(f"  ✓ Updated vpn_users for user {user_id}: path={file_path}, ipVpn={ip_address}")
            return True
        else:
            print(f"  ⚠ No vpn_users record updated for user {user_id}")
            return False
    except Exception as e:
        print(f"  ✗ Error updating vpn_users: {e}")
        return False

# Initialize database connector
db = DatabaseConnector(DB_CONFIG)

if not db.connect():
    print("✗ Failed to connect to database")
    exit(1)

# Get users with VPN profiles and team assignment
# Only process users who have already joined a team (idTeam IS NOT NULL)
users = db.query("""
    SELECT u.id, u.slug_name, vu."idTeam"
    FROM vpn_users vu
    JOIN users u ON vu."idUser" = u.id
    WHERE u.slug_name IS NOT NULL AND vu."idTeam" IS NOT NULL
""")

if not users:
    print("✗ No users with team assignment found in database")
    db.disconnect()
    exit(1)

print(f"Processing {len(users)} users...\n")
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

# Get existing clients to check which ones already exist
try:
    existing_clients_response = session.get(URL_WIREGUARD + E_CRE_USERS)
    existing_clients_response.raise_for_status()
    existing_data = existing_clients_response.json()
    existing_clients = existing_data.get('clients', []) if isinstance(existing_data, dict) else existing_data
    existing_names = [client.get('name', '').lower() for client in existing_clients]
except Exception as e:
    print(f"⚠ Could not fetch existing clients: {e}")
    existing_names = []

# First pass: Create VPN clients with _user suffix
print("Creating VPN clients...")
for user in users:
    user_id, user_slug, team_id = user[0], user[1], user[2]
    user_vpn_name = user_slug + "_user"
    
    # Check if client already exists
    if user_vpn_name.lower() in existing_names:
        print(f"  ⊘ Already exists: {user_vpn_name}")
        continue
    
    r = session.post(
        URL_WIREGUARD + E_CRE_USERS,
        json={'name': user_vpn_name, 'expiresAt': ExpiresAt}
    )
    if r.status_code == 201:
        print(f"  ✓ Created: {user_vpn_name}")
    else:
        print(f"  ⚠ Status {r.status_code}: {user_vpn_name}")

print()

# Second pass: Save configurations and update database
print("Processing VPN configurations...\n")
for user in users:
    user_id, user_slug, team_id = user[0], user[1], user[2]
    user_vpn_name = user_slug + "_user"
    print(f"Processing user: {user_vpn_name} (ID: {user_id})")
    
    # Get all VPN clients from WireGuard
    try:
        response = session.get(URL_WIREGUARD + E_CRE_USERS)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"  ✗ Failed to fetch clients: {e}")
        continue
    
    # Extract clients list
    clients = data.get('clients', []) if isinstance(data, dict) else data
    
    # Find VPN clients matching this user
    matched_clients = []
    for client in clients:
        client_name = client.get('name', '')
        client_id = client.get('id')
        ipv4_address = client.get('ipv4Address')
        
        # Check if client name matches user VPN name
        if user_vpn_name.lower() in client_name.lower():
            matched_clients.append({'id': client_id, 'name': client_name, 'ipv4': ipv4_address})
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
            file_path = save_vpn_config(config_text, user_vpn_name, user_id)
            if not file_path:
                continue
            
            # Update database with file path and IP
            update_vpn_user_path(db, user_id, team_id, file_path, ip_address)
        except Exception as e:
            print(f"    ✗ Failed to fetch configuration for {client_name}: {e}")
            continue
    
    print()

db.disconnect()
print("✓ VPN user sync completed")
