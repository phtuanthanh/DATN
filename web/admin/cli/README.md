# VPN Status CLI

Command-line interface for managing VPN status and WireGuard integration with database queries.

## Features

✓ Connect to PostgreSQL database
✓ Query teams, VPN configurations, services, and competition settings
✓ WireGuard API integration (login and operations)
✓ Beautiful formatted output

## Installation

1. Install Python dependencies:
```bash
cd /home/hades/AD/web/admin/cli
pip install -r requirements.txt
```

2. Ensure `.env` file in `/home/hades/AD/web/admin` has database credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ad_challenge
DB_USER=postgres
DB_PASSWORD=password
```

## Usage

Run the CLI script:
```bash
python vpn-status.py
```

## Output

The script will display:
- **Competition Settings**: Current competition schedule and configuration
- **Teams**: All active teams with their IDs and member counts
- **VPN Team Configurations**: WireGuard VPN configurations for teams
- **Scoring Services**: Available services with margins

## Database Queries

The `DatabaseConnector` class provides methods to query:

### Get Teams
```python
db = DatabaseConnector(DB_CONFIG)
db.connect()
teams = db.get_teams()  # Returns list of all active teams
db.disconnect()
```

### Get VPN Configurations
```python
# Get VPN configs for specific team
vpn_configs = db.get_vpn_team_configs(team_id=1)

# Get all VPN configurations
vpn_configs = db.get_vpn_team_configs()
```

### Get Services
```python
services = db.get_services()  # Returns all scoring services
```

### Get Competition
```python
competition = db.get_competition()  # Returns current competition settings
```

## WireGuard Integration

To enable WireGuard operations, uncomment the WireGuard login section in the `run()` method:

```python
if self.wireguard_login():
    # Perform WireGuard operations here
    pass
```

## Configuration

Edit the following constants in `vpn-status.py`:

- `URL_WIREGUARD`: WireGuard API endpoint
- `USERNAME`: WireGuard admin username
- `PASSWORD`: WireGuard admin password
- `DB_CONFIG`: Database connection parameters

## Error Handling

The script includes error handling for:
- Database connection failures
- Query execution errors
- WireGuard API errors

All errors are printed with ✗ prefix for easy identification.
