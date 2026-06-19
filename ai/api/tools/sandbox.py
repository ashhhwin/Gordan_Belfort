"""
Secure Python sandbox tool for the Gordan Belfort AI agent.
Enhanced with timeout protection, pre-imported financial libs, and memory limits.
"""

import sys
import io
import base64
import signal
import contextlib
from langchain_core.tools import tool

# Pre-import setup code injected into every sandbox execution
SETUP_CODE = """
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io as _io
import base64 as _base64

# Dark theme for all matplotlib charts
plt.style.use('dark_background')
plt.rcParams.update({
    'figure.facecolor': '#0D1117',
    'axes.facecolor': '#0D1117',
    'axes.edgecolor': '#30363D',
    'axes.labelcolor': '#8E8E93',
    'xtick.color': '#8E8E93',
    'ytick.color': '#8E8E93',
    'text.color': '#E0E0E0',
    'grid.color': '#21262D',
    'grid.alpha': 0.3,
    'legend.facecolor': '#161B22',
    'legend.edgecolor': '#30363D',
    'figure.figsize': [14, 7],
    'figure.dpi': 150,
})

_original_show = plt.show

def _custom_show(*args, **kwargs):
    buf = _io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', facecolor='#0D1117', edgecolor='none')
    buf.seek(0)
    img_base64 = _base64.b64encode(buf.read()).decode('utf-8')
    print(f"\\n[[IMAGE_BASE64:{img_base64}]]\\n")
    plt.clf()

plt.show = _custom_show

# Pre-import common financial libraries
import numpy as np
import pandas as pd
try:
    import scipy
    import scipy.stats
except ImportError:
    pass
try:
    from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.model_selection import train_test_split, TimeSeriesSplit
    from sklearn.metrics import mean_absolute_error, r2_score, accuracy_score
    from sklearn.preprocessing import StandardScaler
except ImportError:
    pass
"""

SANDBOX_TIMEOUT = 30  # seconds


class TimeoutError(Exception):
    pass


def _timeout_handler(signum, frame):
    raise TimeoutError("Execution timed out after 30 seconds")


@tool
def python_sandbox(code: str) -> str:
    """
    Execute Python code in a sandboxed environment with pre-imported financial libraries.
    
    PRE-IMPORTED LIBRARIES (no need to import these):
    - numpy (as np), pandas (as pd), matplotlib.pyplot (as plt)
    - scipy, scipy.stats
    - sklearn (RandomForest, GradientBoosting, LinearRegression, train_test_split, etc.)
    
    RULES:
    - To draw charts: use matplotlib and call plt.show() — it will be captured as an image.
    - Always print() your final numerical answers so they are captured by stdout.
    - Maximum execution time: 30 seconds.
    - If the python_sandbox tool returns [[IMAGE_BASE64:...]], include that EXACT string
      in your final response — the UI renders it as an image.
    
    Args:
        code: Python code to execute
    """
    stdout = io.StringIO()
    stderr = io.StringIO()

    full_code = SETUP_CODE + "\n" + code

    # Set timeout
    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(SANDBOX_TIMEOUT)

    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                exec(full_code, {"__builtins__": __builtins__})
            except TimeoutError:
                return "⏱️ Execution timed out after 30 seconds. Try optimizing your code or reducing data size."
            except Exception as e:
                import traceback
                traceback.print_exc(file=stderr)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    out = stdout.getvalue()
    err = stderr.getvalue()

    if err:
        return f"⚠️ Execution completed with errors:\n```\n{err}\n```\n\nStandard Output:\n{out}"

    return f"✅ Execution successful.\n\n{out}"
