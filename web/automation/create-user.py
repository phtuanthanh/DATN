#!/usr/bin/env python3
"""
Auto User Creator Script
Creates multiple user accounts with random credentials
Default password: Thanhloveliv2004@
Random email and avatar generation
"""

import sys
import os
import json
import requests
from datetime import datetime
from io import BytesIO
from PIL import Image, ImageDraw
import random
import string
import argparse

# Configuration
BASE_URL = "http://100.107.117.57:3000"
REGISTER_ENDPOINT = f"{BASE_URL}/auth/register"
DEFAULT_PASSWORD = "Thanhloveliv2004@"

# Vietnamese names for generating realistic usernames and fullnames
VIETNAMESE_FIRST_NAMES = [
    "Thanh", "Linh", "Minh", "Huy", "Tú", "Dung", "Anh", "Bảo",
    "Chi", "Duy", "Efore", "Giang", "Hải", "Hana", "Hằng", "Huyền",
    "Ít", "Khanh", "Liên", "Long", "Lương", "Mạnh", "Nhi", "Ngân",
    "Nhật", "Nó", "Phong", "Phương", "Quân", "Quỳnh", "Rồng", "Sơn",
    "Tấn", "Tâm", "Tân", "Tây", "Thái", "Thảo", "Thế", "Thiên",
    "Thiều", "Thịnh", "Thống", "Thy", "Tín", "Tín", "Trang", "Trân",
    "Trần", "Trung", "Tú", "Tuấn", "Tưởng", "Uyên", "Vân", "Vệ",
    "Việt", "Vinh", "Võ", "Vũ", "Xuyến", "Yến", "Yểu", "Yêu",
    "Yên", "Yết", "Yểu", "Yêu"
]

VIETNAMESE_LAST_NAMES = [
    "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi",
    "Đỗ", "Võ", "Dương", "Tô", "Đinh", "Nông", "Tạ", "Tống",
    "Điểu", "Đường", "Phí", "Tưởng", "Mạ", "Ôn", "Hỏa", "Đầu"
]

class UserCreator:
    def __init__(self, count=1, base_url=BASE_URL):
        self.count = count
        self.base_url = base_url
        self.register_url = f"{base_url}/auth/register"
        self.session = requests.Session()
        self.created_users = []
        self.failed_users = []
        
    def generate_random_email(self):
        """Generate random email"""
        random_part = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        return f"{random_part}@adchallenge.local"
    
    def generate_random_fullname(self):
        """Generate random Vietnamese fullname"""
        first_name = random.choice(VIETNAMESE_FIRST_NAMES)
        last_name = random.choice(VIETNAMESE_LAST_NAMES)
        return f"{last_name} {first_name}"
    
    def generate_random_username(self):
        """Generate random username (letters and numbers only)"""
        # Get random first and last name
        first_name = random.choice(VIETNAMESE_FIRST_NAMES).lower()
        last_name = random.choice(VIETNAMESE_LAST_NAMES).lower()
        
        # Remove diacritics - map Vietnamese characters to ASCII
        diacritic_map = {
            'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
            'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
            'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
            'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
            'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
            'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
            'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
            'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
            'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
            'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
            'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
            'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
            'đ': 'd'
        }
        
        for old, new in diacritic_map.items():
            first_name = first_name.replace(old, new)
            last_name = last_name.replace(old, new)
        
        # Combine: lastname + random number for uniqueness
        random_suffix = random.randint(1, 999)
        username = f"{last_name}{first_name}{random_suffix}"
        
        return username
    
    def generate_random_avatar(self, size=300):
        """Generate a random colored avatar image"""
        img = Image.new('RGB', (size, size), color=(
            random.randint(50, 255),
            random.randint(50, 255),
            random.randint(50, 255)
        ))
        draw = ImageDraw.Draw(img)
        
        # Draw a random shape
        shape_type = random.choice(['circle', 'square', 'triangle'])
        color = (random.randint(0, 200), random.randint(0, 200), random.randint(0, 200))
        
        if shape_type == 'circle':
            draw.ellipse([50, 50, 250, 250], fill=color)
        elif shape_type == 'square':
            draw.rectangle([50, 50, 250, 250], fill=color)
        else:  # triangle
            points = [(150, 50), (250, 250), (50, 250)]
            draw.polygon(points, fill=color)
        
        # Convert to bytes
        img_io = BytesIO()
        img.save(img_io, 'JPEG', quality=85)
        img_io.seek(0)
        return img_io
    
    def create_user(self, username, email, fullname, password, debug=False):
        """Create a single user via API"""
        try:
            # Generate random avatar
            avatar_file = self.generate_random_avatar()
            
            files = {
                'avatar': ('avatar.jpg', avatar_file, 'image/jpeg')
            }
            
            data = {
                'username': username,
                'email': email,
                'fullName': fullname,
                'password': password,
                'passwordConfirm': password
            }
            
            response = self.session.post(self.register_url, files=files, data=data, timeout=10, allow_redirects=False)
            
            if debug:
                print(f"  DEBUG - Status Code: {response.status_code}")
                print(f"  DEBUG - Location Header: {response.headers.get('Location', 'N/A')}")
                print(f"  DEBUG - Response Length: {len(response.text)}")
            
            # Check if we got a 302/301 redirect (successful registration)
            if response.status_code in [301, 302, 303, 307]:
                print(f"✓ User created: {username} ({email})")
                self.created_users.append({
                    'username': username,
                    'email': email,
                    'fullname': fullname,
                    'password': password
                })
                return True
            else:
                print(f"✗ Failed to create {username}: HTTP {response.status_code}")
                print(f"  Response: {response.text[:200]}")
                self.failed_users.append(username)
                return False
                
        except Exception as e:
            print(f"✗ Error creating {username}: {str(e)}")
            self.failed_users.append(username)
            return False
    
    def run(self):
        """Create multiple users"""
        print(f"\n{'='*60}")
        print(f"AD Challenge - Auto User Creator")
        print(f"{'='*60}")
        print(f"Target URL: {self.register_url}")
        print(f"Number of users to create: {self.count}")
        print(f"Default password: {DEFAULT_PASSWORD}")
        print(f"{'='*60}\n")
        
        created = 0
        for i in range(self.count):
            username = self.generate_random_username()
            email = self.generate_random_email()
            fullname = self.generate_random_fullname()
            
            print(f"[{i+1}/{self.count}] Creating user: {username}")
            # Disable debug mode by default
            debug = False
            if self.create_user(username, email, fullname, DEFAULT_PASSWORD, debug=debug):
                created += 1
            
        self._print_summary(created)
        return created, len(self.failed_users)
    
    def _print_summary(self, created):
        """Print summary of created users"""
        print(f"\n{'='*60}")
        print(f"SUMMARY")
        print(f"{'='*60}")
        print(f"✓ Successfully created: {created} users")
        print(f"✗ Failed: {len(self.failed_users)} users")
        print(f"{'='*60}\n")
        
        if self.created_users:
            print("Created users:")
            print(f"{'Username':<20} {'Email':<30} {'Password':<30}")
            print("-" * 80)
            for user in self.created_users:
                print(f"{user['username']:<20} {user['email']:<30} {user['password']:<30}")
            print()
        
        if self.failed_users:
            print("Failed users:")
            for username in self.failed_users:
                print(f"  - {username}")
            print()

def main():
    global DEFAULT_PASSWORD
    
    parser = argparse.ArgumentParser(description='Create multiple user accounts')
    parser.add_argument('-c', '--count', type=int, default=1, help='Number of users to create (default: 1)')
    parser.add_argument('-u', '--url', type=str, default=BASE_URL, help=f'Base URL (default: {BASE_URL})')
    parser.add_argument('-p', '--password', type=str, default=DEFAULT_PASSWORD, help=f'Password (default: {DEFAULT_PASSWORD})')
    
    args = parser.parse_args()
    
    if args.count < 1:
        print("Error: Count must be at least 1")
        sys.exit(1)
    
    if args.count > 100:
        response = input(f"Warning: You want to create {args.count} users. Continue? (y/n): ")
        if response.lower() != 'y':
            print("Cancelled.")
            sys.exit(0)
    
    # Override default password if provided
    DEFAULT_PASSWORD = args.password
    
    creator = UserCreator(count=args.count, base_url=args.url)
    created, failed = creator.run()
    
    sys.exit(0 if failed == 0 else 1)

if __name__ == '__main__':
    main()
