#!/usr/bin/env python3
"""
Gordan Belfort AI Pulse — Entry Point
Run: python start_pulse.py [--dry-run | --run-now | --schedule]
"""

import sys
from pathlib import Path

# Add ai/ to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pulse.pulse_runner import main

if __name__ == "__main__":
    main()
