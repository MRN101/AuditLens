# 🔍 AuditLens — AI-Powered Expense Auditing Platform

## The Problem

Corporate expense fraud costs organizations billions annually. Manual auditing is slow, error-prone, and inconsistent — auditors can only review a fraction of submitted claims, letting fraudulent or non-compliant expenses slip through. Companies need an intelligent, scalable solution that can audit **every** expense claim with policy-aware AI while keeping humans in the loop for edge cases.

## The Solution

**AuditLens** is an end-to-end AI-powered expense auditing platform that automates receipt processing, policy compliance checking, and anomaly detection. It uses **Google Gemini Vision** for multimodal OCR, a semantic **policy engine** for rule-based compliance, and **statistical anomaly detection** (Z-score analysis) to flag suspicious claims — achieving real-time, deterministic auditing with zero hallucinations through a 3-layer validation pipeline.

### Key Features

- **AI Receipt Processing** — Upload receipts (JPG, PNG, PDF); Gemini Vision extracts merchant, date, amount, currency, line items with per-field confidence scores
- **Cross-Validation Layer** — 5 independent sanity checks (summation, date, amount, confidence, currency) catch AI hallucinations before they propagate
- **Policy-Aware Auditing** — RAG-based semantic search matches claims against company expense policies for compliance verdicts
- **Anomaly Detection** — Z-score statistical analysis flags outlier spending patterns per employee
- **Multi-Currency Support** — Auto-converts international expenses to INR via Exchange Rate API
- **Auditor Dashboard** — Risk-priority queue, bulk approve/reject, human-in-the-loop override with audit trail
- **Real-Time Analytics** — Spending trends, category breakdowns, status distribution, top offenders leaderboard
- **Tally-Compatible Export** — CSV exports in both standard and Tally ERP voucher format (Dr/Cr, GST, Indian dates)
- **Employee Portal** — Drag-and-drop upload, real-time claim tracking, duplicate detection
- **Policy Chatbot** — Natural language Q&A against uploaded company policy documents

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, Zustand (state), Recharts (charts), React Router v6 |
| **Backend** | Node.js, Express.js, Socket.IO (real-time notifications) |
| **Database** | MongoDB with Mongoose ODM |
| **AI/ML** | Google Gemini 2.0 Flash (Vision OCR + LLM audit), `temperature: 0` for deterministic output |
| **Policy Engine** | Python Flask microservice, sentence-transformers embeddings, cosine similarity search |
| **Auth** | JWT + bcrypt (12 rounds), role-based access control (Employee/Auditor/Admin) |
| **Security** | Helmet.js, CORS whitelist, rate limiting, input validation |
| **APIs** | Google Gemini API, ExchangeRate-API (currency conversion) |
| **Dev Tools** | Nodemon, ESLint, Vite HMR |

## Architecture

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
              │ AI API   │    │ (Flask:8000)  │
              └──────────┘    └──────────────┘
```

### AI Pipeline (6 Stages)

1. **OCR Extraction** — Gemini Vision parses receipt images with strict anti-hallucination prompts
2. **Cross-Validation** — 5 sanity checks verify extracted data against mathematical and logical rules
3. **Currency Normalization** — Auto-convert to INR via ExchangeRate-API
4. **Policy Matching** — Semantic search against company expense rules (RAG)
5. **Anomaly Detection** — Z-score analysis vs. employee historical spending
6. **LLM Audit Verdict** — Gemini classifies compliance with cited policy rules and confidence scores

## Setup Instructions

### Prerequisites
- **Node.js** ≥ 18
- **MongoDB** (local installation or MongoDB Atlas)
- **Python** 3.10+ (for the policy engine, optional)
- **Google Gemini API key** ([Get one here](https://makersuite.google.com/app/apikey))
- **ExchangeRate API key** ([Get one here](https://www.exchangerate-api.com/))

### Step 1: Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/AuditLens.git
cd AuditLens
```

### Step 2: Install Dependencies
```bash
# Install all dependencies (server + client)
npm run install:all
```

### Step 3: Configure Environment
```bash
# Copy the example env file
cp .env.example server/.env
```

Edit `server/.env` with your credentials:
```env
MONGODB_URI=mongodb://localhost:27017/auditlens
JWT_SECRET=your_secure_secret_here
GEMINI_API_KEYS=your_gemini_api_key_here
EXCHANGE_RATE_API_KEY=your_exchange_rate_key_here
POLICY_ENGINE_URL=http://localhost:8000
CLIENT_URL=http://localhost:5173
```

### Step 4: Start the Application
```bash
# Terminal 1: Start server (auto-restarts on changes)
cd server
npm run dev

# Terminal 2: Start client (Vite dev server with HMR)
cd client
npm run dev
```

### Step 5: (Optional) Start Policy Engine
```bash
cd policy-engine
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python app.py
```

### Step 6: Open the App
Navigate to **http://localhost:5173** in your browser.

**Default test accounts:**
| Role | Email | Password |
|------|-------|----------|
| Employee | testemployee@company.com | password123 |
| Auditor | testauditor@company.com | password123 |

## Project Structure

```
AuditLens/
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── components/         # Reusable UI (Sidebar, Modals, Charts)
│   │   ├── pages/
│   │   │   ├── auth/           # Login, Register
│   │   │   ├── employee/       # Submit Receipt, My Claims
│   │   │   └── auditor/        # Dashboard, Analytics, Export, Policy
│   │   ├── services/           # API client (axios)
│   │   ├── store/              # Zustand state management
│   │   └── index.css           # Design system (CSS custom properties)
│   └── vite.config.js
├── server/                     # Express.js backend
│   ├── config/                 # Database connection
│   ├── middleware/             # Auth (JWT), file upload (Multer)
│   ├── models/                 # Mongoose schemas (User, Claim, Policy)
│   ├── routes/                 # RESTful API routes
│   └── services/
│       ├── ocrService.js       # Gemini Vision OCR + cross-validation
│       ├── auditEngine.js      # AI compliance audit pipeline
│       ├── geminiRateLimiter.js # API key rotation + rate limiting
│       └── duplicateDetection.js
├── policy-engine/              # Python Flask microservice
│   ├── app.py                  # API endpoints
│   ├── ingest.py               # PDF chunking & embedding
│   └── query.py                # Semantic policy search
└── package.json                # Root scripts (install:all, dev)
```

## Security

- JWT authentication with role-based access control (Employee / Auditor / Admin)
- bcrypt password hashing (12 salt rounds)
- Helmet.js security headers (CSP, HSTS, XSS protection)
- Rate limiting — 1000 req/15min global, 20 req/15min for auth endpoints
- CORS whitelist configuration
- Input validation and sanitization
- File upload restrictions (type, size, duplicate hash checking)

## License

ISC
