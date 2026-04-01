# 🔍 AuditLens — Smart Expense Auditor

> AI-powered corporate expense auditing platform with policy-first compliance, OCR receipt processing, and real-time analytics.

## ✨ Features

### 🧑‍💼 Employee Portal
- **Receipt Upload** — Drag & drop receipts (JPG, PNG, PDF) with live preview
- **AI OCR Extraction** — Gemini Vision auto-extracts merchant, date, amount, currency
- **Real-time Status** — Watch claims transition from pending → processing → approved/flagged
- **Claim History** — Filterable claim table with pagination and detail modals
- **Duplicate Detection** — MD5 hash-based receipt deduplication

### 🏦 Auditor Dashboard
- **Risk-Priority Queue** — Claims sorted by risk level (high → low)
- **Human-in-the-Loop** — Override AI decisions with auditor comments
- **Bulk Actions** — Batch approve/reject multiple claims
- **CSV Export** — Download claims data for reporting
- **Search & Filter** — By status, risk, employee name, merchant

### 📊 Analytics
- **Spending Trends** — 7/30/90-day line charts
- **Category Breakdown** — Bar chart of spending by expense type
- **Status Distribution** — Donut chart of claim outcomes
- **Top Offenders** — Leaderboard of most-flagged employees
- **Processing Metrics** — Average AI audit time

### 📋 Policy Engine
- **PDF Upload & Ingestion** — Chunk and embed policy documents
- **Semantic Search** — RAG-based policy rule retrieval
- **Version Management** — Track and activate policy versions

### 🤖 AI Pipeline
1. **OCR** — Gemini Vision multimodal receipt parsing
2. **Currency Normalization** — Auto-convert to USD via Exchange Rate API
3. **Policy Matching** — Semantic search against company expense rules
4. **Anomaly Detection** — Z-score analysis vs. employee historical spending
5. **LLM Audit** — Gemini classifies compliance with cited policy rules
6. **Compliance Scoring** — Per-employee approval rate tracking

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   React UI  │────▶│  Express API    │────▶│  MongoDB     │
│   (Vite)    │     │  (Node.js)      │     │              │
│   Port 5173 │     │  Port 5000      │     │              │
└─────────────┘     └────────┬────────┘     └──────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
              ┌──────────┐    ┌──────────────┐
              │ Gemini   │    │ Policy Engine │
              │ AI API   │    │ (Flask:8000) │
              └──────────┘    └──────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- Python 3.10+ (for policy engine)
- Gemini API key

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Configure Environment
```bash
cp .env.example server/.env
# Edit server/.env with your API keys
```

### 3. Start Development
```bash
# Terminal 1: Start both server + client
npm run dev

# Terminal 2: (Optional) Start policy engine
cd policy-engine
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### 4. Open Browser
Navigate to `http://localhost:5173`

---

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | ✅ |
| `JWT_SECRET` | JWT signing secret (change in production!) | ✅ |
| `GEMINI_API_KEY` | Google Gemini API key | ✅ |
| `EXCHANGE_RATE_API_KEY` | ExchangeRate-API.com key | ✅ |
| `POLICY_ENGINE_URL` | Policy microservice URL | ❌ |
| `CLIENT_URL` | Frontend URL for CORS | ❌ |

---

## 📁 Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route pages (auth, employee, auditor)
│   │   ├── services/       # API client (axios)
│   │   ├── store/          # Zustand state management
│   │   └── index.css       # Design system (CSS custom properties)
│   └── index.html
├── server/                 # Express.js backend
│   ├── config/             # Database connection
│   ├── middleware/         # Auth, upload, error handling
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API routes
│   └── services/           # AI audit engine, OCR, duplicate detection
├── policy-engine/          # Python Flask microservice
│   ├── app.py              # FastAPI endpoints
│   ├── ingest.py           # PDF chunking & embedding
│   └── query.py            # Semantic policy search
└── package.json            # Root scripts
```

---

## 🛡️ Security

- JWT authentication with role-based access control
- bcrypt password hashing (12 rounds)
- Helmet.js security headers
- Rate limiting (global + auth-specific)
- Input validation with Zod schemas
- CORS whitelist configuration
- Graceful shutdown with DB cleanup

## 📄 License

ISC
