# Email Verification System - Architecture & Design

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                          │
├─────────────────────────────────────────────────────────────┤
│  ├─ Register Form (resgiter.ejs)                             │
│  ├─ Login Form (login.ejs)                                   │
│  └─ Team Management (team.ejs)                               │
├─────────────────────────────────────────────────────────────┤
│           HTTP/REST API Routes (Express.js)                  │
├─────────────────────────────────────────────────────────────┤
│  POST /auth/register  →  PostResgiter() [Controller]         │
│  POST /auth/login     →  PostLogin() [Controller]            │
│  GET  /auth/verify/:token  →  verifyEmail() [Controller]     │
│  POST /team/create    →  createTeam() [Controller]           │
│  POST /team/join      →  joinTeam() [Controller]             │
└─────────────────────────────────────────────────────────────┘
       ↓                          ↓
┌──────────────────────┐  ┌──────────────────────┐
│   SERVICES LAYER     │  │  MIDDLEWARE LAYER    │
├──────────────────────┤  ├──────────────────────┤
│ • userServices       │  │ • authMiddleware     │
│ • emailService       │  │ • verification Mid.  │
│ • teamServices       │  │ • errorHandler       │
└──────────────────────┘  └──────────────────────┘
       ↓                          ↓
┌──────────────────────────────────────────────────┐
│         UTILITIES LAYER                           │
├──────────────────────────────────────────────────┤
│ • tokenGenerator.js (token validation)            │
│ • fileValidator.js (avatar upload)                │
└──────────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────────┐
│           DATA LAYER (Sequelize ORM)              │
├──────────────────────────────────────────────────┤
│ • User Model (with verification fields)          │
│ • Team Model                                      │
│ • Database (PostgreSQL)                          │
└──────────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────────┐
│       EXTERNAL SERVICES                           │
├──────────────────────────────────────────────────┤
│ • SMTP Email Server (nodemailer)                 │
│ • Database Server (PostgreSQL)                   │
└──────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Architecture

### Registration Flow Architecture
```
User Registration Request
        ↓
[routes/auth.js]
        ↓
PostResgiter() [userController.js]
    ├─ Validate form inputs
    ├─ Upload avatar [services/userServices.js]
    └─ Call register() [services/userServices.js]
                ├─ Validate email format
                ├─ Validate password strength
                ├─ Check existing user
                ├─ Hash password [bcryptjs]
                ├─ Generate token [utils/tokenGenerator.js]
                ├─ Create user in DB [User Model]
                └─ Return verification token
        ↓
Send verification email [services/emailService.js]
    ├─ Build verification link (BASE_URL + token)
    ├─ Create HTML template
    └─ Send via SMTP [nodemailer]
        ↓
User Response
    └─ Success message: "Check your email"
```

### Email Verification Flow Architecture
```
User clicks email link
        ↓
GET /auth/verify/:token [routes/auth.js]
        ↓
verifyEmail() [userController.js]
    ├─ Find user by token [User.findOne()]
    ├─ Check token exists
    ├─ Validate expiration [utils/tokenGenerator.js]
    ├─ Update user:
    │   ├─ isVerified = true
    │   ├─ verificationToken = null
    │   └─ tokenExpiresAt = null
    ├─ Save to DB
    └─ Redirect to login with success message
```

### Login Flow Architecture
```
User Login Request
        ↓
[routes/auth.js → POST /auth/login]
        ↓
PostLogin() [userController.js]
        ↓
login() [services/userServices.js]
    ├─ Find user by email
    ├─ Verify password [bcryptjs]
    ├─ Check isVerified ← NEW CHECK
    │   ├─ if false: ERROR
    │   └─ if true: Continue
    ├─ Check isActive
    └─ Return user data
        ↓
If verified & active: [userController.js]
    ├─ Generate JWT token
    ├─ Set HTTP-only cookie
    └─ Redirect to dashboard
```

### Team Access Control Flow Architecture
```
User tries to create/join team
        ↓
[routes/team.js → POST /team/create or /join]
        ↓
authMiddleware [middleware/authMiddleware.js]
    └─ Verify JWT token from cookie
        ↓
checkUserVerified [middleware/verificationMiddleware.js]
    ├─ Get req.user.id from JWT
    ├─ Fetch user from DB [User.findByPk()]
    ├─ Check isVerified === true
    │   ├─ if false: Return 403 error page
    │   └─ if true: Call next()
        ↓
Team Controller (createTeam/joinTeam)
    └─ Proceed with team operation
```

---

## 🎯 Component Responsibilities

### tokenGenerator.js
**Responsibility**: Token lifecycle management
- Generate cryptographic tokens
- Calculate expiry timestamps
- Validate token expiration
**Interface**:
```javascript
generateToken() → string
getTokenExpiry() → Date
isTokenExpired(expiresAt) → boolean
```

### emailService.js
**Responsibility**: Email communication
- Compose professional HTML emails
- Send via configured SMTP server
- Handle email errors gracefully
**Interface**:
```javascript
sendVerificationEmail(email, token, username) → Promise
sendPasswordResetEmail(email, token, username) → Promise
```

### verificationMiddleware.js
**Responsibility**: Route-level verification enforcement
- Check if user exists
- Verify email status
- Block unverified access
- Return appropriate errors
**Interface**:
```javascript
verificationMiddleware(req, res, next)
checkUserVerified(req, res, next) → Promise
```

### User Model
**Responsibility**: Data representation
- Store verification state
- Persist tokens and expiry
**New Fields**:
```javascript
isVerified: BOOLEAN
verificationToken: STRING (unique)
tokenExpiresAt: TIMESTAMP
```

### userServices.js
**Responsibility**: Business logic
- Orchestrate registration process
- Generate and manage tokens
- Validate user credentials
**Modified Methods**:
```javascript
register(..., avatarPath) → extends token generation
login(email, password) → adds verification check
```

### userController.js
**Responsibility**: HTTP request handling
- Route coordination
- Email sending invocation
- Response formatting
**New Methods**:
```javascript
verifyEmail(req, res) → handles /verify/:token
```

---

## 🔐 Security Model

### Authentication vs Verification
```
Authentication:
  ├─ JWT token in HTTP-only cookie
  ├─ Proves identity (user is who they claim)
  └─ Required for login

Email Verification:
  ├─ isVerified flag in database
  ├─ Proves email ownership (user controls email)
  └─ Required for team access
```

### Token Security
```
Token Generation:
  ├─ crypto.randomBytes(32) → 256-bit entropy
  ├─ .toString('hex') → URL-safe format
  └─ Unique index prevents collisions

Token Storage:
  ├─ Database (indexed for fast lookup)
  ├─ HTTP URL parameter (safe for GET request)
  └─ Expires in 10 minutes (limited window)

Token Validation:
  ├─ Verify token exists in database
  ├─ Verify not yet expired
  ├─ Verify not already used
  └─ Clear token after first use
```

### Email Link Security
```
Verification Link: /auth/verify/{token}
  ├─ GET request (idempotent, repeatable)
  ├─ Token in URL (only in email to intended recipient)
  ├─ 10-minute expiry (limited attack window)
  ├─ One-time effective (token cleared after first use)
  └─ No CSRF token needed (GET is safe by design)
```

### Verification Enforcement
```
Team Operations:
  ├─ Require authentication (JWT token)
  ├─ Require verification (isVerified = true)
  ├─ Layered protection (auth → verification → action)
  └─ Database check (not just token claim)
```

---

## 🗄️ Database Schema Design

### User Table Extensions
```sql
User Table:
  ├─ id (PRIMARY KEY)
  ├─ username (UNIQUE)
  ├─ email (UNIQUE)
  ├─ password (hashed)
  ├─ fullName
  ├─ avatar
  ├─ isActive (existing)
  ├─ isVerified (NEW - default: false)
  ├─ verificationToken (NEW - UNIQUE, nullable)
  ├─ tokenExpiresAt (NEW - TIMESTAMP, nullable)
  ├─ teamId (FOREIGN KEY)
  ├─ createdAt
  └─ updatedAt

Indexes:
  ├─ PRIMARY KEY (id)
  ├─ UNIQUE (username)
  ├─ UNIQUE (email)
  └─ UNIQUE (verificationToken) ← NEW
```

### Verification Lifecycle
```
State: unverified
  ├─ isVerified: false
  ├─ verificationToken: "abc123..."
  ├─ tokenExpiresAt: 2024-01-15 10:10:00
  └─ user - can't login, can't access teams

   ↓ [User clicks link within 10 minutes]

State: verified
  ├─ isVerified: true
  ├─ verificationToken: null
  ├─ tokenExpiresAt: null
  └─ user - can login, can access teams

   ↓ [10 minutes pass without verification]

State: expired (requires re-registration)
  └─ token is still in DB but isTokenExpired() returns true
```

---

## 🧪 Testing Architecture

### Unit Tests (Future)
```javascript
tokenGenerator.test.js
  ├─ generateToken() produces valid hex string
  ├─ getTokenExpiry() returns 10-min offset
  └─ isTokenExpired() correctly validates timestamps

emailService.test.js
  ├─ sendVerificationEmail() builds correct payload
  └─ Link generation includes BASE_URL

verificationMiddleware.test.js
  ├─ Blocks unverified users
  └─ Allows verified users
```

### Integration Tests (Future)
```javascript
registration.test.js
  ├─ User can register
  ├─ Verification email sent
  ├─ User can't login before verification
  └─ User can login after verification

teams.test.js
  ├─ Unverified user can't create team
  ├─ Verified user can create team
  ├─ Unverified user can't join team
  └─ Verified user can join team
```

---

## 📊 Sequence Diagrams

### Registration Sequence
```
User          Browser           Server          Email Server
  │              │                │                   │
  │─Reg Form─→   │                │                   │
  │              │─POST /register→ │                   │
  │              │                 │                   │
  │              │                 │─Validate────────│
  │              │                 │─Generate Token──│
  │              │                 │─Create User────│
  │              │                 │                │
  │              │                 │─Send Email─────────→
  │              │                 │←Email Sent────────│
  │              │                 │                │
  │              │←Success Page────│                │
  │←--Success msg│                 │                │
```

### Verification Sequence
```
User          Browser           Server        Database
  │              │                │              │
  │─Click Link   │                │              │
  │   (email)    │                │              │
  │              │─GET /verify    │              │
  │              │  /:token───────→              │
  │              │                │              │
  │              │                │─Find User───→
  │              │                │←User Found───
  │              │                │              │
  │              │                │─Check Token─│
  │              │                │ -Check Exp. │
  │              │                │              │
  │              │                │─Update User─→
  │              │                │ isVerified  │
  │              │                │←Update OK───
  │              │                │              │
  │              │←Redirect/Login─│              │
  │←Verified OK──│                │              │
```

### Login Sequence
```
User          Browser           Server         Database
  │              │                │              │
  │─Credentials  │                │              │
  │              │─POST /login────→              │
  │              │                │              │
  │              │                │─Find User───→
  │              │                │←User Data───│
  │              │                │              │
  │              │                │─Check Pass──│
  │              │                │-Check Verified│
  │              │                │              │
  ├─VERIFIED OK  │←Set Cookie────│              │
  │              │←Redirect/Dash──              │
```

---

## 🎛️ Configuration Model

```
Environment Configuration
├─ SMTP_HOST (default: smtp.gmail.com)
├─ SMTP_PORT (default: 587)
├─ SMTP_SECURE (default: false)
├─ SMTP_USER (email account)
├─ SMTP_PASSWORD (app-specific password)
├─ SMTP_FROM (sender address)
└─ BASE_URL (e.g., http://localhost:3000)

Hard-Coded Configuration
├─ Token length: 32 bytes (256 bits)
├─ Token expiry: 10 minutes
├─ Password requirements: 8+ chars, uppercase, lowercase, number, special
└─ Email templates: Built into emailService.js
```

---

## 🔄 Error Handling Model

```
Error Scenarios:

Registration Errors:
  ├─ Validation error → Show on registration page
  ├─ Email already exists → Show on registration page
  ├─ Avatar upload failed → Show on registration page
  ├─ Email send failed → Log error, continue (graceful degradation)
  └─ Database error → Show generic error page

Login Errors:
  ├─ Invalid credentials → Show on login page
  ├─ Account not active → Show on login page
  ├─ Email not verified → Show helpful message on login page
  └─ Database error → Show generic error page

Verification Errors:
  ├─ Token not found → 404 error page
  ├─ Token expired → 400 error page
  ├─ Database error → 500 error page
  └─ Invalid token format → 400 error page

Team Access Errors:
  ├─ Not authenticated → Redirect to login
  ├─ Email not verified → 403 Forbidden with message
  ├─ User not found → 403 Forbidden
  └─ Database error → 500 error page
```

---

## 🚀 Performance Considerations

### Database Queries
```
Registration:
  ├─ Check existing user: 1 query (indexed by email/username)
  ├─ Create user: 1 query
  └─ Total: 2 queries

Login:
  ├─ Find user by email: 1 query (indexed)
  ├─ Total: 1 query

Verification:
  ├─ Find user by token: 1 query (UNIQUE indexed)
  ├─ Update user: 1 query
  └─ Total: 2 queries

Team Access Check:
  ├─ Find user by ID: 1 query (PKindexed)
  └─ Total: 1 query
```

### Email Sending
```
Async operation:
  ├─ Non-blocking (doesn't delay response)
  ├─ Error logged but doesn't fail registration
  └─ User gets confirmation regardless of email success
```

---

## 📚 Code Organization

```
/web
├─ /routes
│  ├─ auth.js (Auth routes + new /verify/:token)
│  └─ team.js (Team routes + verification middleware)
├─ /controller
│  ├─ userController.js (+ verifyEmail method)
│  └─ teamController.js (unchanged - uses middleware)
├─ /services
│  ├─ userServices.js (register + modified login)
│  ├─ emailService.js (NEW)
│  └─ teamServices.js (unchanged)
├─ /middleware
│  ├─ authMiddleware.js (existing)
│  ├─ verificationMiddleware.js (NEW)
│  └─ errorHandler.js (existing)
├─ /utils
│  ├─ tokenGenerator.js (NEW)
│  └─ fileValidator.js (existing)
├─ /models
│  └─ userModel.js (extended with verification fields)
└─ /views
   ├─ resgiter.ejs (+ success message)
   ├─ login.ejs (+ success message)
   └─ (other views unchanged)
```

---

**Summary**: Email verification system follows MVC architecture with clear separation of concerns, layered middleware, and comprehensive error handling. Designed for security, scalability, and maintainability.
