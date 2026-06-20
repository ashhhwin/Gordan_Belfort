#!/bin/bash
set -e

# Get absolute path to the project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Starting Gordan Belfort NSE Data Pipeline at $(date)"

# Trap errors to log failure
handle_error() {
    echo "Pipeline failed on line $1"
    exit 1
}
trap 'handle_error $LINENO' ERR

echo "Step 1: Downloading NSE JSON data..."
# Run the python script from the virtual environment
"$PROJECT_ROOT/ai/venv/bin/python" "$PROJECT_ROOT/scripts/ingestion/nse_downloader.py"

echo "Step 2: Ingesting into PostgreSQL..."
node "$PROJECT_ROOT/database/api/load_nse.js"

echo "Pipeline completed successfully at $(date)!"
