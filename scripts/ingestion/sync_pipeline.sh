#!/bin/bash

# Navigate to the project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo "Starting Gordan Belfort INDMoney Sync Pipeline at $(date)"

# 1. Download latest INDMoney report using the custom script
echo "Step 1: Downloading report..."
python3 scripts/ingestion/indmoney_downloader.py
if [ $? -ne 0 ]; then
    echo "Download failed!"
    exit 1
fi

# 2. Clean the raw data
echo "Step 2: Cleaning data..."
python3 scripts/ingestion/clean_indmoney_family.py
if [ $? -ne 0 ]; then
    echo "Cleaning failed!"
    exit 1
fi

# 3. Load into Database and Snapshot History
echo "Step 3: Ingesting into PostgreSQL..."
cd database/api
node load_holdings.js
if [ $? -ne 0 ]; then
    echo "Ingestion failed!"
    cd ../..
    exit 1
fi

cd ../..
echo "Pipeline completed successfully at $(date)!"
exit 0
