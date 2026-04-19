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

## Status

Hackathon prototype focused on proving one idea:

**Your face decides whether the laptop shows the truth or a convincing fake.**
