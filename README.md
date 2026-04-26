# Aura GroupSolver - Quick Launch Guide

## Requirements
- Python 3.9+
- Node.js 16+
- Docker & Docker Compose (optional)

## Option 1: Quick Start (Local)

**IMPORTANT: You must launch Ollama in a separate terminal first!**

**Terminal 1 - Start Ollama:**
```bash
# Install Ollama: https://ollama.ai
ollama pull gemma2:2b  # Downloads ~1.6GB model (~2 min on first run)
ollama serve
```

**Terminal 2 - Start the application:**
```bash
cd groupsolver
bash start.sh
```

Then open:
- **Frontend**: http://localhost:5173
- **Backend API Docs**: http://localhost:8000/docs

## Option 2: Docker (Recommended)

**Ollama is included automatically!**

```bash
cd groupsolver
docker-compose up
```

Docker-compose automatically:
- ✓ Launches Ollama service
- ✓ Starts FastAPI backend (depends on Ollama)
- ✓ Starts Vite frontend (depends on backend)

Then open:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8000

## Manual Setup (if needed)

**Step 1: Start Ollama** (in separate terminal):
```bash
# Install Ollama: https://ollama.ai
ollama pull gemma2:2b  # Downloads ~1.6GB model (~2 min on first run)
ollama serve
```

**Step 2: Backend**:
```bash
cd groupsolver/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (in new terminal):
```bash
cd groupsolver/frontend
npm install
npm run dev
```

## Environment Variables (Optional)
Create `.env` in the backend folder:
```
SKYSCANNER_API_KEY=your_key
FIREBASE_PROJECT_ID=your_id
FIREBASE_CREDENTIALS_JSON=your_json
```

## Troubleshooting
- Port 8000/5173 in use? Change port in `start.sh` or docker-compose.yml
- Missing dependencies? Run `pip install -r requirements.txt` and `npm install`

