#!/usr/bin/env python3
"""Compile and trace one request inside the isolated runner container."""

import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

WORK = Path("/work")
SOURCE = WORK / "source.cpp"
PROGRAM = WORK / "program"
RAW_TRACE = WORK / "raw-trace.jsonl"
META = WORK / "runtime-meta.json"
MAX_SOURCE = int(os.environ.get("RUNNER_MAX_SOURCE_BYTES", "65536"))
MAX_OUTPUT = int(os.environ.get("RUNNER_MAX_OUTPUT_BYTES", "65536"))


def bounded(value: str) -> str:
    return value.encode("utf-8", errors="replace")[:MAX_OUTPUT].decode("utf-8", errors="replace")


def diagnostics(stderr: str):
    pattern = re.compile(r"(?:/work/)?source\.cpp:(\d+):(\d+):\s+(fatal error|error|warning|note):\s+([^\n]+)")
    result = []
    for line, column, severity, message in pattern.findall(stderr):
        result.append({
            "line": int(line), "column": int(column),
            "severity": "fatal" if severity == "fatal error" else severity,
            "message": message.strip(),
        })
    return result


def respond(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")))
    sys.stdout.flush()


def run():
    started = time.monotonic()
    try:
        request = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        respond({"protocolError": f"Invalid runner request: {error}"})
        return 2
    source = request.get("source", "")
    if not isinstance(source, str) or len(source.encode("utf-8")) > MAX_SOURCE:
        respond({"policyError": "source_size_limit"})
        return 2
    mode = request.get("languageMode", "cpp20")
    standard = "c++17" if mode == "cpp17" else "c++20"
    limits = request.get("limits", {})
    timeout_ms = min(max(int(limits.get("timeoutMs", 10000)), 100), 30000)
    max_steps = min(max(int(limits.get("maxSteps", 1000)), 1), 5000)
    WORK.mkdir(parents=True, exist_ok=True)
    SOURCE.write_text(source, encoding="utf-8")
    (WORK / "stdin.txt").write_text(str(request.get("stdin", ""))[:MAX_OUTPUT], encoding="utf-8")
    flags = [
        f"-std={standard}", "-g3", "-O0", "-fno-omit-frame-pointer",
        "-fno-optimize-sibling-calls", "-Wall", "-Wextra", "-pedantic",
        "-fsanitize=address,undefined", "-fno-sanitize-recover=all",
    ]
    compile_started = time.monotonic()
    compile_result = subprocess.run(
        ["g++", *flags, str(SOURCE), "/opt/seeplusplus/trace_alloc.cpp", "-o", str(PROGRAM)],
        capture_output=True, text=True, timeout=max(timeout_ms / 1000, 5), check=False,
        cwd=WORK,
    )
    compile_ms = int((time.monotonic() - compile_started) * 1000)
    compiler_version = subprocess.run(["g++", "-dumpfullversion"], capture_output=True, text=True, check=False).stdout.strip()
    compile_payload = {
        "exitCode": compile_result.returncode,
        "stdout": bounded(compile_result.stdout), "stderr": bounded(compile_result.stderr),
        "diagnostics": diagnostics(compile_result.stderr),
        "compilerName": "g++", "compilerVersion": compiler_version, "flags": flags,
    }
    tracer = {"name": "gdb-python", "version": "1.0.0", "imageDigest": os.environ.get("RUNNER_IMAGE_DIGEST", "local-unpinned")}
    if compile_result.returncode != 0:
        respond({"compile": compile_payload, "terminalKind": "compile_failure", "tracer": tracer, "timings": {"compileMs": compile_ms, "runMs": 0, "totalMs": int((time.monotonic()-started)*1000)}})
        return 0

    environment = os.environ.copy()
    environment.update({
        "RUNNER_MAX_STEPS": str(max_steps),
        "RUNNER_MAX_OUTPUT_BYTES": str(MAX_OUTPUT),
        "ASAN_OPTIONS": "detect_leaks=0:abort_on_error=1:symbolize=1",
        "UBSAN_OPTIONS": "halt_on_error=1:print_stacktrace=1",
    })
    run_started = time.monotonic()
    terminal_kind = "success"
    terminal_message = None
    try:
        trace_result = subprocess.run(
            ["gdb", "-q", "-batch", "-nx", "-x", "/opt/seeplusplus/gdb_trace.py", "--args", str(PROGRAM)],
            capture_output=True, text=True, env=environment,
            timeout=timeout_ms / 1000, check=False, start_new_session=True,
            cwd=WORK,
        )
    except subprocess.TimeoutExpired:
        terminal_kind = "timeout"
        terminal_message = f"Execution exceeded {timeout_ms} ms"
        trace_result = None
    run_ms = int((time.monotonic() - run_started) * 1000)
    records = []
    if RAW_TRACE.exists():
        for line in RAW_TRACE.read_text(encoding="utf-8", errors="replace").splitlines()[:max_steps]:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                terminal_kind = "tracer_error"
                terminal_message = "Malformed GDB trace record"
                break
    runtime_meta = {}
    if META.exists():
        try:
            runtime_meta = json.loads(META.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            terminal_kind = "tracer_error"
    signal_name = runtime_meta.get("signal")
    exit_code = runtime_meta.get("exitCode")
    stderr = bounded((WORK / "stderr.txt").read_text(encoding="utf-8", errors="replace") if (WORK / "stderr.txt").exists() else "")
    stdout = bounded((WORK / "stdout.txt").read_text(encoding="utf-8", errors="replace") if (WORK / "stdout.txt").exists() else "")
    output_overflow = any(path.exists() and path.stat().st_size > MAX_OUTPUT for path in (WORK / "stdout.txt", WORK / "stderr.txt"))
    if terminal_kind == "success" and output_overflow:
        terminal_kind, terminal_message = "output_limit", f"Program output exceeded {MAX_OUTPUT} bytes"
    elif terminal_kind == "success" and runtime_meta.get("stepLimit"):
        terminal_kind, terminal_message = "output_limit", "Maximum execution-step count reached"
    elif terminal_kind == "success" and signal_name:
        terminal_kind = "signal"
    elif terminal_kind == "success" and exit_code not in (None, 0):
        terminal_kind = "runtime_error"
    elif terminal_kind == "success" and trace_result and trace_result.returncode != 0 and not records:
        terminal_kind, terminal_message = "tracer_error", bounded(trace_result.stderr or trace_result.stdout)
    for record in records:
        record["stdout"] = stdout
        record["stderr"] = stderr
    respond({
        "compile": compile_payload,
        "records": records,
        "runtime": {"exitCode": exit_code, **({"signal": signal_name} if signal_name else {}), "stdout": stdout, "stderr": stderr},
        "terminalKind": terminal_kind,
        **({"terminalMessage": terminal_message} if terminal_message else {}),
        "tracer": tracer,
        "timings": {"compileMs": compile_ms, "runMs": run_ms, "totalMs": int((time.monotonic()-started)*1000)},
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
