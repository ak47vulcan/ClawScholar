"""
Sandbox Executor — listens on Redis for code execution requests.
Runs code in an isolated subprocess, captures stdout/stderr and matplotlib plots.
"""

import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import time

import redis

from security import SecurityError, check_code

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE_EXECUTE = "sandbox:execute"
RESULT_PREFIX = "sandbox:result"
TIMEOUT = int(os.environ.get("SANDBOX_TIMEOUT_SECONDS", "30"))

# Matplotlib plot capture wrapper prepended to all user code
PLOT_CAPTURE_PREAMBLE = """
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as _plt_orig
import base64
import io as _io

_captured_plots = []
_orig_savefig = _plt_orig.savefig
_orig_show = _plt_orig.show

def _capture_savefig(*args, **kwargs):
    buf = _io.BytesIO()
    _plt_orig.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    buf.seek(0)
    _captured_plots.append(base64.b64encode(buf.read()).decode())
    buf.close()

def _capture_show():
    _capture_savefig()
    _plt_orig.clf()

_plt_orig.savefig = _capture_savefig
_plt_orig.show = _capture_show
import matplotlib.pyplot as plt
"""

PLOT_CAPTURE_EPILOGUE = """
import json, sys
print("__PLOTS__:" + json.dumps(_captured_plots), file=sys.stderr)
"""


def run_code(code: str, timeout: int) -> dict:
    try:
        check_code(code)
    except SecurityError as e:
        return {"stdout": "", "stderr": str(e), "plots": [], "exit_code": -2}
    except SyntaxError as e:
        return {"stdout": "", "stderr": str(e), "plots": [], "exit_code": -3}

    wrapped = PLOT_CAPTURE_PREAMBLE + "\n" + code + "\n" + PLOT_CAPTURE_EPILOGUE

    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False, dir="/tmp") as f:
        f.write(wrapped)
        tmp_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd="/tmp",
        )
        stdout = result.stdout
        raw_stderr = result.stderr
        plots: list[str] = []

        # Extract plots from stderr
        stderr_lines = []
        for line in raw_stderr.splitlines():
            if line.startswith("__PLOTS__:"):
                try:
                    plots = json.loads(line[len("__PLOTS__:"):])
                except Exception:
                    pass
            else:
                stderr_lines.append(line)
        stderr = "\n".join(stderr_lines)

        return {"stdout": stdout, "stderr": stderr, "plots": plots, "exit_code": result.returncode}

    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"Execution timed out after {timeout}s", "plots": [], "exit_code": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "plots": [], "exit_code": -1}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def main() -> None:
    r = redis.from_url(REDIS_URL, decode_responses=True)
    print(f"Sandbox executor ready. Listening on {QUEUE_EXECUTE}", flush=True)

    while True:
        try:
            item = r.blpop([QUEUE_EXECUTE], timeout=5)
            if not item:
                continue
            _, payload_str = item
            payload = json.loads(payload_str)
            task_id = payload["task_id"]
            code = payload["code"]
            timeout = payload.get("timeout_seconds", TIMEOUT)

            print(f"Executing task {task_id}", flush=True)
            start = time.monotonic()
            result = run_code(code, timeout)
            elapsed = time.monotonic() - start
            result["duration_ms"] = int(elapsed * 1000)

            result_key = f"{RESULT_PREFIX}:{task_id}"
            r.rpush(result_key, json.dumps(result))
            r.expire(result_key, 300)  # 5 min TTL
            print(f"Task {task_id} done in {elapsed:.2f}s, exit={result['exit_code']}", flush=True)

        except KeyboardInterrupt:
            print("Sandbox shutting down", flush=True)
            break
        except Exception as e:
            print(f"Executor error: {e}", flush=True)
            time.sleep(1)


if __name__ == "__main__":
    main()
