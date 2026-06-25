#!/bin/bash

# Navigate to the project root directory
# Get the absolute path to the directory containing this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT" || { echo "Failed to change directory to project root: $PROJECT_ROOT"; exit 1; }

# User must ensure this script is run within their correct Python environment (e.g., conda activate stock_pilot)
# Or they can explicitly set the PYTHON_BIN variable below for cron execution
PYTHON_BIN="${PYTHON_BIN:-/Users/ashwinram/Personal Coding Projects/stock_pilot/ai/venv/bin/python}"

# Create logs directory if it doesn't exist
mkdir -p logs

# Optionally override default env vars for IBKR here, if running on a different server:
# export IBKR_HOST="192.168.1.100"
# export IBKR_PORT="4001"

# Run the ingestion script
echo "--- Starting portfolio cron job at $(date) ---"
"$PYTHON_BIN" scripts/ingestion/ibkr_portfolio_cron.py 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "--- Portfolio ingestion failed with exit code $EXIT_CODE at $(date) ---"
else
    echo "--- Portfolio ingestion completed successfully at $(date) ---"
fi

exit $EXIT_CODE
