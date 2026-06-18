import sys
import io
import base64
import contextlib
from langchain_core.tools import tool

# Intercept matplotlib so we can capture plots to base64
SETUP_CODE = """
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64

_original_show = plt.show

def _custom_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    print(f"\\n[[IMAGE_BASE64:{img_base64}]]\\n")
    plt.clf()

plt.show = _custom_show
"""

@tool
def python_sandbox(code: str) -> str:
    """
    Executes Python code in a secure sandbox.
    Use this to perform complex mathematical calculations, data analysis, or simulations.
    If you want to draw a graph, import matplotlib.pyplot as plt, draw your plot, and call plt.show(). 
    The graph will be automatically captured and returned to the user.
    Always print() your final numerical answers so they are captured by stdout.
    """
    stdout = io.StringIO()
    stderr = io.StringIO()
    
    full_code = SETUP_CODE + "\n" + code

    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        try:
            # We use exec() here because we are already isolated inside a Docker container.
            exec(full_code, {})
        except Exception as e:
            import traceback
            traceback.print_exc(file=stderr)
            
    out = stdout.getvalue()
    err = stderr.getvalue()
    
    if err:
        return f"Execution failed with error:\n{err}\n\nStandard Output:\n{out}"
    
    return f"Execution successful.\nStandard Output:\n{out}"
