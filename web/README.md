# AD Challenge - Web Server

Đây là trang web chính cho AD Challenge của N3m3s1s Club.

## 📋 Yêu cầu

- Node.js (v14 hoặc cao hơn)
- npm hoặc yarn

## 🚀 Hướng dẫn cài đặt & chạy

### 1. Cài đặt dependencies

```bash
cd web
npm install
```

Hoặc nếu dùng yarn:

```bash
yarn install
```

### 2. Cấu hình biến môi trường

File `.env` đã được tạo sẵn. Bạn có thể chỉnh sửa các giá trị nếu cần:

```
PORT=3000
SESSION_SECRET=your-super-secret-key-please-change-this-in-production
NODE_ENV=development
```

### 3. Chạy server

**Mode development (tự reload):**

```bash
npm run dev
```

**Mode production:**

```bash
npm start
```

## 📍 URLs có sẵn

| URL | Mô tả |
|-----|-------|
| `http://localhost:3000/` | Trang chủ (Home) |
| `http://localhost:3000/auth/login` | Trang đăng nhập |
| `http://localhost:3000/auth/register` | Trang đăng ký |
| `http://localhost:3000/dashboard` | Dashboard (cần login) |
| `http://localhost:3000/api/leaderboard` | API bảng xếp hạng |

## 🎨 Cấu trúc thư mục

```
web/
├── server.js              # File server chính
├── package.json           # Dependencies
├── .env                   # Biến môi trường
├── views/
│   ├── home.ejs          # Trang chủ
│   ├── login.ejs         # Trang đăng nhập
│   ├── resgiter.ejs      # Trang đăng ký
│   └── error.ejs         # Trang lỗi
├── public/
│   ├── css/
│   │   └── style.css     # CSS chính
│   ├── js/
│   │   └── main.js       # JavaScript chính
│   └── images/           # Hình ảnh (nếu có)
├── routes/
│   └── user.js           # Routes người dùng
├── middleware/
│   └── authMiddleware.js # Middleware xác thực
├── models/
│   └── userModel.js      # Model người dùng
└── controller/
    └── userController.js # Controller người dùng
```

## 🔧 Các tính năng

- ✅ Trang chủ đẹp với animations
- ✅ Hệ thống xác thực (login/register)
- ✅ Session quản lý
- ✅ Dashboard cho người dùng
- ✅ API leaderboard
- ✅ Responsive design

## 📝 Ghi chú

1. **Bảo mật**: Thay đổi `SESSION_SECRET` trong file `.env` trước khi deploy
2. **Database**: Hiện tại server sử dụng session memory. Cần kết nối database thực tế
3. **HTTPS**: Trong production, cần bật `secure: true` trong session config
4. **Port**: Mặc định là 3000, có thể thay đổi trong `.env`

## 🛠️ Troubleshooting

### Port đang bị sử dụng

Nếu cặp "Error: listen EADDRINUSE", thay đổi PORT trong `.env` hoặc kill process đang sử dụng port:

```bash
# Linux/Mac
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Module không tìm thấy

Chắc chắn đã chạy `npm install`:

```bash
npm install
```

### Trang không load

- Kiểm tra console log có lỗi gì không
- Đảm bảo server đang chạy
- Kiểm tra URL có đúng không

## 📞 Hỗ trợ

Liên hệ N3m3s1s Club để được hỗ trợ.

---

**Tấn công là một bộ phận của N3m3s1s Club** 🔒⚔️
