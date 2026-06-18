#!/bin/bash

echo "========================================"
echo "🚀 Running Gordan Belfort Test Suite 🚀"
echo "========================================"

echo ""
echo "📦 Installing Dependencies..."
echo "----------------------------------------"
cd database/api
npm install -D vitest supertest
cd ../../ui
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
cd ../ai
source venv/bin/activate
pip install pytest pytest-asyncio pytest-mock httpx

echo ""
echo "🧪 Running Backend API Tests (10 tests) 🧪"
echo "----------------------------------------"
cd ../database/api
npx vitest run --reporter=verbose

echo ""
echo "🧪 Running Frontend UI & Store Tests (32 tests) 🧪"
echo "----------------------------------------"
cd ../../ui
npx vitest run --reporter=verbose

echo ""
echo "🧪 Running Python Pipeline & Scraper Tests (8 tests) 🧪"
echo "----------------------------------------"
cd ../ai
source venv/bin/activate
python -m pytest tests/ -v

echo ""
echo "✅ All tests completed!"
echo "========================================"
