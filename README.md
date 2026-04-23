# Mirage

Mirage is a cloud file storage app with a hidden deception layer.

After login, a silent face check decides what the user sees:
- the real user gets their real files
- anyone else gets a believable AI-generated decoy filesystem

There’s no warning, lockout, or obvious mode switch. The fake environment looks normal on purpose.

## Why It Exists

Mirage is built for situations where sensitive files may be exposed through:
- device theft
- compelled device access
- border searches
- hostile physical access

Instead of blocking access, Mirage can quietly serve fake but plausible documents.

## How It Works

- User logs in with email and password
- Browser captures a face embedding with `face-api.js`
- Backend compares it to the enrolled face
- Session is routed to either:
  - **real mode**
  - **decoy mode**
- In decoy mode, the app serves fake filenames and generated document content that look legitimate

## Stack

**Frontend**
- React
- Vite
- face-api.js

**Backend**
- Node.js
- Express
- SQLite
- better-sqlite3
- bcrypt
- multer

**AI**
- Ollama
- Gemma for fake filename and document generation

**Infra**
- Vultr
- Caddy
- pm2

## Key Idea

Mirage keeps the illusion believable by making real and decoy sessions look the same:
- same UI
- same file browser
- same response shapes
- same basic metadata

Only the visible file names and contents change.

## What Makes It Cool

- face-based access routing
- AI-generated decoy documents
- silent deception instead of obvious denial
- suspicious decoy activity can be logged as security alerts

## Running Locally

**Requires:** Node 22+, npm, and [Ollama](https://ollama.com).

Mirage relies on Ollama for decoy file generation. In our deployment it runs on a developer's MacBook and is exposed to the server over ngrok — **this Mac is not part of the repo**, so anyone cloning Mirage needs to provide their own Ollama instance.

### 1. Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Or download from [ollama.com/download](https://ollama.com/download).

### 2. Pull the model

```bash
ollama pull gemma2:9b
```

Any reasonably capable instruct-tuned model works (e.g. `gemma2:9b`, `llama3.1:8b`). Smaller models are faster but produce less convincing decoys. Update `OLLAMA_MODEL` in your `.env` to match whatever you pulled.

### 3. Start Ollama

```bash
ollama serve
```

By default it listens on `http://localhost:11434`.

### 4. Point the server at it

Copy `.env.example` to `.env` and set:

```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:9b
```

If you want the Mirage server to reach Ollama on a *different* machine (our setup), expose the Ollama host publicly — e.g. with ngrok:

```bash
ngrok http 11434
```

Then set `OLLAMA_URL` to the ngrok URL.

### 5. Run Mirage

```bash
# server
cd server && npm install && npm start

# client (new terminal)
cd client && npm install && npm run dev
```

The SQLite database auto-creates on first server start — no migrations to run.

## First-Time Setup

Once the app is running (client on `http://localhost:5173`):

1. **Register** a new account with email + password.
2. **Enroll your face** when prompted — this captures the embedding Mirage compares against on every login.
3. **Upload a few real files** so there's something to protect.
4. **Log out, then log back in** with a different face in view (or a photo of someone else) to see decoy mode kick in.

That's it — you're now running the full real-vs-decoy flow end-to-end.

## Status

Hackathon prototype focused on proving one idea:

**Your face decides whether the laptop shows the truth or a convincing fake.**
