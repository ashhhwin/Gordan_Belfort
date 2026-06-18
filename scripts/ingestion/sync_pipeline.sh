#!/bin/bash

# Navigate to the project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo "Starting Gordan Belfort INDMoney Sync Pipeline at $(date)"

# Start logger and capture ID
LOG_ID=$(node "$PROJECT_ROOT/database/api/logger.js" start "Portfolio Sync" | tail -n 1)

# 1. Download latest INDMoney report using the custom script
echo "Step 1: Downloading report..."
python3 scripts/ingestion/indmoney_downloader.py
if [ $? -ne 0 ]; then
    echo "Download failed!"
    node database/api/logger.js end $LOG_ID "FAILED" "Failed during INDMoney download (Playwright)."
    exit 1
fi

# 2. Clean the raw data
echo "Step 2: Cleaning data..."
python3 scripts/ingestion/clean_indmoney_family.py
if [ $? -ne 0 ]; then
    echo "Cleaning failed!"
    node database/api/logger.js end $LOG_ID "FAILED" "Failed during data cleaning."
    exit 1
fi

# 3. Load into Database and Snapshot History
echo "Step 3: Ingesting into PostgreSQL..."
cd database/api
node load_holdings.js
if [ $? -ne 0 ]; then
    echo "Ingestion failed!"
    cd ../..
    node database/api/logger.js end $LOG_ID "FAILED" "Failed during database ingestion."
    exit 1
fi

cd ../..
echo "Pipeline completed successfully at $(date)!"
node database/api/logger.js end $LOG_ID "SUCCESS" "Pipeline completed successfully."
exit 0
