#!/usr/bin/env bash
# Quick-start both backend and frontend

echo "=== GroupSolver Quick Start ==="

# Backend
echo "[1/2] Starting FastAPI backend on http://localhost:8000"
cd backend
pip3 install -r requirements.txt -q
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend
echo "[2/2] Starting Vite frontend on http://localhost:5173"
cd frontend
npm install -q
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✈️  GroupSolver is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" INT
wait
