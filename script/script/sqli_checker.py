#!/usr/bin/env python3
import os,sys
import logging
import requests
from bs4 import BeautifulSoup

from lib.lib import BaseChecker, CheckResult, get_flag, set_flagid, load_state, run_check, store_state

PORT_SERVICE = 5000
TOKEN = ''
# IP='100.82.191.96'
class ExampleChecker(BaseChecker):
    def check_service(self):
        global TOKEN
        logging.info('STEP 1: Service check START')
        username = 'root'
        password = 'QsrXM&Tz)PxMq5,9C~!"QH8.3FGW8sD6'
        
        try:
            session = requests.Session()
            logging.debug('Connecting to http://%s:%d/login', self.ip, PORT_SERVICE)
            r = session.post(url="http://"+str(self.ip)+":"+str(PORT_SERVICE)+"/login", data={'username': username, 'password': password}, timeout=5)
            logging.debug('HTTP Status: %d', r.status_code)

            if(r.status_code != 200):
                logging.warning('STEP 1: Service check DOWN - HTTP %d | Response: %s', r.status_code, r.text[:200])
                return CheckResult.DOWN
            
            data = r.json()
            if data.get('success') == False:
                logging.warning('STEP 1: Service check FAULTY - success=false')
                return CheckResult.FAULTY
            
            TOKEN =  r.headers.get('Set-Cookie', '')
            logging.debug('Token from Set-Cookie: %s', TOKEN[:50] if TOKEN else 'None')
            if TOKEN:
                parts = TOKEN.split(';')
                for part in parts:
                    if part.strip().startswith('jwt='):
                        TOKEN = part.strip()[len('jwt='):]
            else:
                logging.warning('STEP 1: Service check FAULTY - No Set-Cookie header')
                return CheckResult.FAULTY
        except Exception as e:
            logging.warning('STEP 1: Service check DOWN - Exception: %s | %s', type(e).__name__, str(e))
            return CheckResult.DOWN
           
        logging.info('STEP 1: Service check OK')
        return CheckResult.OK
    
    def place_flag(self, tick):
        global TOKEN
        logging.info('STEP 2 [tick=%d]: Place flag START', tick)
        try:
            flag = get_flag(tick)
            logging.debug('Flag to place: %s...', flag[:20] if flag else 'None')
            r = requests.post(url="http://"+str(self.ip)+":"+str(PORT_SERVICE)+"/update_doc/12", data={'title': flag,'content':flag}, cookies={'jwt':TOKEN}, timeout=5)
            logging.debug('HTTP Status: %d', r.status_code)

            if(r.status_code == 500):
                logging.warning('STEP 2 [tick=%d]: Place flag DOWN - HTTP 500 | Response: %s', tick, r.text[:200])
                return CheckResult.DOWN
            if(r.status_code != 200):
                logging.warning('STEP 2 [tick=%d]: Place flag FAULTY - HTTP %d', tick, r.status_code)
                return CheckResult.FAULTY
        except Exception as e:
            logging.warning('STEP 2 [tick=%d]: Place flag DOWN - Exception: %s | %s', tick, type(e).__name__, str(e))
            return CheckResult.DOWN
        
        logging.info('STEP 2 [tick=%d]: Place flag OK', tick)
        return CheckResult.OK

    def check_flag(self, tick):
        global TOKEN
        logging.info('STEP 3 [tick=%d]: Check flag START', tick)
        try:
            flag = get_flag(tick)
            logging.debug('Expected flag: %s...', flag[:20] if flag else 'None')
            r = requests.get(url="http://"+str(self.ip)+":"+str(PORT_SERVICE)+"/view_docs/12",cookies={'jwt':TOKEN}, timeout=5)
            logging.debug('HTTP Status: %d', r.status_code)

            if(r.status_code == 403):
                logging.warning('STEP 3 [tick=%d]: Check flag FAULTY - HTTP 403')
                return CheckResult.FAULTY
            if(r.status_code == 500):
                logging.warning('STEP 3 [tick=%d]: Check flag DOWN - HTTP 500')
                return CheckResult.DOWN
            
            soup = BeautifulSoup(r.text, "html.parser")
            title = soup.find(class_="doc-title")
            if title is None:
                logging.warning('STEP 3 [tick=%d]: Check flag FAULTY - No doc-title found. Response: %s', tick, r.text[:200])
                return CheckResult.FAULTY
            
            flag_on_target = title.get_text(strip=True)
            logging.debug('Flag on target: %s...', flag_on_target[:20] if flag_on_target else 'None')
            if flag_on_target != flag:
                logging.warning('STEP 3 [tick=%d]: Check flag FLAG_NOT_FOUND', tick)
                return CheckResult.FLAG_NOT_FOUND
        except Exception as e:
            logging.warning('STEP 3 [tick=%d]: Check flag FAULTY - Exception: %s | %s', tick, type(e).__name__, str(e))
            return CheckResult.FAULTY
        
        logging.info('STEP 3 [tick=%d]: Check flag OK', tick)
        return CheckResult.OK

if __name__ == '__main__':
    run_check(ExampleChecker)
