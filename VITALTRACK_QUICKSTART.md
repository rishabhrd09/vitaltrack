# ⚡ VitalTrack Developer Quick Start

This guide documents the **exact steps** to get VitalTrack running locally after cloning the repository.

---

## ✅ Prerequisites

| Tool | Version | Verify Command |
|------|---------|----------------|
| **Docker Desktop** | Latest | `docker --version` |
| **Node.js** | 18+ | `node -v` |
| **Git** | Any | `git --version` |

> **Note:** PostgreSQL is NOT required locally. It runs inside Docker.

---

## 🚀 Quick Setup (Recommended)

### Step 1: Run the Setup Script

From the **project root** folder, run the helper script:

**Windows:**
```cmd
setup-local-dev.bat
```

**Mac/Linux:**
```bash
chmod +x setup-local-dev.sh
./setup-local-dev.sh
```

This script:
- Auto-detects your local IP address.
- Creates the `vitaltrack-mobile/.env` file with the correct API URL.
- Prints the remaining commands.

---

### Step 2: Start the Backend (Terminal 1)

```bash
cd vitaltrack-backend
docker-compose up --build
```

**Wait for this message:**
```
vitaltrack-api | Database tables created/verified
```

✅ **Verify:** Open `http://YOUR_IP:8000/health` in a browser.

---

### Step 3: Start the Frontend (Terminal 2)

Open a **new** terminal window:

```bash
cd vitaltrack-mobile
npm install
npx expo start -c
```

---

### Step 4: Run on Device

- **Android Emulator:** Press `a` in the terminal.
- **iOS Simulator:** Press `i` in the terminal.
- **Physical Phone:** Scan the QR code with the **Expo Go** app.

> **Important:** Your phone and computer must be on the **same WiFi network**.

---

### Step 5: Create an Account

1. The app opens to the Login screen.
2. Tap **"Create Account"**.
3. Register a new user.
4. You are redirected to the Dashboard.

🎉 **You're done!**

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| `Network request failed` | Ensure phone & computer are on the same WiFi. |
| Docker containers not starting | Run `docker-compose down`, then `docker-compose up --build`. |
| Port 8000 in use | Stop other services on port 8000, or change the port in `docker-compose.yml`. |
| Windows Firewall blocking | Allow port `8000` for inbound connections. |

---

## 🔧 Manual Setup (Advanced)

If you cannot use Docker, follow these steps:

<details>
<summary>Click to expand Manual Setup Instructions</summary>

### Backend (without Docker)

1. Install **PostgreSQL 14+** and create a database named `vitaltrack`.
2. Navigate to `vitaltrack-backend`.
3. Create a virtual environment:
   ```bash
   python -m venv venv
   # Windows: .\venv\Scripts\activate
   # Mac/Linux: source venv/bin/activate
   ```
4. Install dependencies: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and update `DATABASE_URL` with your local Postgres credentials.
6. Run migrations: `alembic upgrade head`
7. Start server: `python -m app.main`

### Frontend

Follow Steps 3-5 from the Quick Setup above.

</details>

---

## 📂 Project Structure

```
vitaltrack-production-ready/
├── vitaltrack-backend/        # FastAPI + Docker + PostgreSQL
│   ├── docker-compose.yml     # Backend + DB containers
│   ├── app/                   # Python source code
│   └── alembic/               # Database migrations
├── vitaltrack-mobile/         # React Native + Expo
│   ├── app/                   # App screens (file-based routing)
│   ├── components/            # UI components
│   └── services/              # API calls
├── setup-local-dev.bat        # Windows setup script
├── setup-local-dev.sh         # Mac/Linux setup script
└── README.md
```
