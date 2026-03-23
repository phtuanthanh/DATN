#!/usr/bin/env python3
import os,sys
import logging
import requests
import jwt
from bs4 import BeautifulSoup
import datetime
from lib.lib import BaseChecker, CheckResult, get_flag, set_flagid, load_state, run_check, store_state

PORT_SERVICE = 3001
SECRET_KEY = '3209040904320'
TOKEN=''
class ExampleChecker(BaseChecker):
    def check_service(self):
        global TOKEN
        try:        
            payload = {
            'username': 'ThanhDepTrai',
            'role': 'super_admin',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }
            TOKEN = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
            cookie = {'token':TOKEN}

            r = requests.post(url="http://"+str(self.ip)+":"+str(PORT_SERVICE)+"/admin/Jack",cookies=cookie, timeout=5)
            logging.debug('HTTP Status: %d', r.status_code)
            
            if(r.status_code != 200):
                return CheckResult.DOWN
            
            if "Nope" in r.text:
                return CheckResult.FAULTY
        except Exception as e:
            return CheckResult.DOWN

        return CheckResult.OK
    
    def place_flag(self, tick):
        global TOKEN
        try:
            flag = get_flag(tick)
            flag = flag + '}'
            data = {'Jack': flag}
            r = requests.post(url="http://"+str(self.ip)+":"+str(PORT_SERVICE)+"/admin/Jack", data=data, cookies={'token':TOKEN}, timeout=5)
            
            if "Nope" in r.text:
                return CheckResult.DOWN
            
            if(r.status_code == 200):
                json_data = r.json()
                if json_data.get('data').strip() == flag:
                    return CheckResult.OK
                else:
                    return CheckResult.FAULTY
            else:
                return CheckResult.FAULTY
        except Exception as e:
            return CheckResult.DOWN

    def check_flag(self, tick):
        global TOKEN
        try:
            flag = get_flag(tick)
            r = requests.get(url="http://"+str(self.ip)+":"+str(PORT_SERVICE)+"/admin/Jack",cookies={'token':TOKEN}, timeout=5)

            if "Nope" in r.text:
                return CheckResult.FAULTY
            
            json_data = r.json()
            flag_on_target = json_data.get('data').strip()
            flag_on_target = flag_on_target[:-1]
            
            if flag_on_target != flag:
                return CheckResult.FLAG_NOT_FOUND
        except Exception as e:
            return CheckResult.FAULTY
        
        return CheckResult.OK

if __name__ == '__main__':
    run_check(ExampleChecker)
