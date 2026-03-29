import requests
import json

URL_WIREGUARD = 'https://wireguard.n3m3s1s.org'

USERNAME = 'admin'
PASSWORD = 'N3m3s1sPassw0rd123@'
REMEMBER = False

NAME_TEAM = 'Team1'
ExpiresAt = "2028-06-04T00:00:00.000Z"

E_LOGIN = '/api/session'
E_CRE_TEAMS = '/api/client'

session = requests.Session()
# Send login as JSON instead of form data
r = session.post(URL_WIREGUARD+E_LOGIN, json={'username':USERNAME,'password':PASSWORD,'remember':REMEMBER})
# print(r.text)
r = session.post(URL_WIREGUARD+E_CRE_TEAMS,json={'name':NAME_TEAM,'expiresAt':ExpiresAt})

print(r.text)