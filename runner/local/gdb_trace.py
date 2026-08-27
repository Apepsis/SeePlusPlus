"""GDB Python tracer for SeePlusPlus.

Every record is obtained from the stopped inferior. Source parsing is not used to
invent state. GDB's debug metadata supplies frames, variables, types and values;
the linked allocation tracker supplies new/delete lifetime events.
"""

import json
import os
from pathlib import Path

import gdb

SOURCE_NAME = "source.cpp"
TRACE_PATH = Path("/work/raw-trace.jsonl")
ALLOC_PATH = Path("/work/alloc.log")
STDOUT_PATH = Path("/work/stdout.txt")
STDERR_PATH = Path("/work/stderr.txt")
META_PATH = Path("/work/runtime-meta.json")
MAX_STEPS = int(os.environ.get("RUNNER_MAX_STEPS", "1000"))
MAX_OUTPUT = int(os.environ.get("RUNNER_MAX_OUTPUT_BYTES", "65536"))
MAX_ARRAY = 64
MAX_FIELDS = 64
MAX_DEPTH = 4

alloc_offset = 0
last_signature = None
last_signal = None
exit_code = None


def safe_text(path: Path) -> str:
    try:
        with path.open("rb") as handle:
            return handle.read(MAX_OUTPUT).decode("utf-8", errors="replace")
    except OSError:
        return ""


def normalize_type(type_value):
    try:
        return type_value.strip_typedefs()
    except gdb.error:
        return type_value


def scalar_value(value, type_name):
    try:
        code = normalize_type(value.type).code
        if code == gdb.TYPE_CODE_BOOL:
            return bool(int(value))
        if code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR, gdb.TYPE_CODE_ENUM):
            return int(value)
        if code == gdb.TYPE_CODE_FLT:
            return float(value)
    except (gdb.error, ValueError, OverflowError):
        pass
    return str(value)


def serialize_value(value, depth=0):
    try:
        if value.is_optimized_out:
            return {"kind": "unavailable", "typeName": str(value.type), "reason": "optimized out"}
    except (AttributeError, gdb.error):
        pass
    try:
        runtime_type = normalize_type(value.type)
        type_name = str(runtime_type)
        code = runtime_type.code
        if code == gdb.TYPE_CODE_PTR:
            address = int(value)
            return {
                "kind": "pointer",
                "pointerType": type_name,
                "targetAddress": None if address == 0 else hex(address),
                "state": "null" if address == 0 else "unknown",
            }
        if code in (gdb.TYPE_CODE_REF, gdb.TYPE_CODE_RVALUE_REF):
            address = int(value.address) if value.address else 0
            return {
                "kind": "reference",
                "referenceType": type_name,
                "targetAddress": None if address == 0 else hex(address),
                "state": "unknown",
            }
        if code == gdb.TYPE_CODE_ARRAY:
            low, high = runtime_type.range()
            count = min(high - low + 1, MAX_ARRAY)
            return {
                "kind": "array",
                "typeName": type_name,
                "elements": [serialize_value(value[index], depth + 1) for index in range(low, low + count)],
                **({"truncated": True} if high - low + 1 > MAX_ARRAY else {}),
            }
        if code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
            if depth >= MAX_DEPTH:
                return {"kind": "unavailable", "typeName": type_name, "reason": "maximum inspection depth"}
            fields = []
            for field in runtime_type.fields()[:MAX_FIELDS]:
                if not field.name or field.is_base_class:
                    continue
                try:
                    fields.append({
                        "name": field.name,
                        "value": serialize_value(value[field], depth + 1),
                        **({"offsetBytes": field.bitpos // 8} if field.bitpos is not None else {}),
                    })
                except (gdb.error, RuntimeError):
                    fields.append({
                        "name": field.name,
                        "value": {"kind": "unavailable", "typeName": str(field.type), "reason": "value unreadable"},
                    })
            return {"kind": "object", "typeName": type_name, "fields": fields, "rendered": str(value)[:512]}
        if code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_CHAR, gdb.TYPE_CODE_ENUM, gdb.TYPE_CODE_BOOL, gdb.TYPE_CODE_FLT):
            return {"kind": "scalar", "scalarType": type_name, "value": scalar_value(value, type_name)}
        return {"kind": "scalar", "scalarType": type_name, "value": str(value)[:512]}
    except (gdb.error, RuntimeError, ValueError, OverflowError) as error:
        return {"kind": "unavailable", "reason": str(error) or "debugger could not inspect value"}


def source_frame(frame):
    try:
        sal = frame.find_sal()
        if sal and sal.symtab and Path(sal.symtab.filename).name == SOURCE_NAME:
            return sal
    except gdb.error:
        pass
    return None


def collect_symbols(frame):
    parameters = []
    locals_ = []
    seen = set()
    block = frame.block()
    while block and not block.is_global and not block.is_static:
        for symbol in block:
            if not (symbol.is_argument or symbol.is_variable) or not symbol.name or symbol.name in seen:
                continue
            seen.add(symbol.name)
            try:
                value = symbol.value(frame)
                binding = {
                    "id": f"{frame_id(frame)}:{symbol.name}",
                    "name": symbol.name,
                    "declaredType": str(symbol.type),
                    "storage": "parameter" if symbol.is_argument else "local",
                    "value": serialize_value(value),
                    "initialized": "unknown",
                }
                try:
                    if value.address:
                        binding["address"] = hex(int(value.address))
                except (gdb.error, ValueError, TypeError):
                    pass
                (parameters if symbol.is_argument else locals_).append(binding)
            except (gdb.error, RuntimeError):
                continue
        block = block.superblock
    return parameters, locals_


def frame_id(frame):
    try:
        stack = frame.read_register("sp")
        return f"frame:{frame.name() or '<anonymous>'}:{int(stack):x}"
    except (gdb.error, ValueError, TypeError):
        return f"frame:{frame.name() or '<anonymous>'}:{frame.level()}"


def collect_frames():
    frames = []
    frame = gdb.newest_frame()
    while frame:
        sal = source_frame(frame)
        if sal:
            parameters, locals_ = collect_symbols(frame)
            frames.append({
                "frameId": frame_id(frame),
                "function": {"name": frame.name() or "<anonymous>"},
                "location": {"file": SOURCE_NAME, "line": sal.line},
                "parameters": parameters,
                "locals": locals_,
            })
        frame = frame.older()
    return frames


def collect_pointees(frame):
    pointees = {}
    block = frame.block()
    visited_symbols = set()
    while block and not block.is_global and not block.is_static:
        for symbol in block:
            if not (symbol.is_argument or symbol.is_variable) or not symbol.name or symbol.name in visited_symbols:
                continue
            visited_symbols.add(symbol.name)
            try:
                value = symbol.value(frame)
                runtime_type = normalize_type(value.type)
                if runtime_type.code != gdb.TYPE_CODE_PTR or int(value) == 0:
                    continue
                address = hex(int(value))
                target_type = normalize_type(runtime_type.target())
                pointees[address] = {
                    "address": address,
                    "typeName": str(target_type),
                    "value": serialize_value(value.dereference(), 1),
                }
            except (gdb.error, RuntimeError, ValueError, TypeError):
                continue
        block = block.superblock
    return list(pointees.values())


def read_alloc_events():
    global alloc_offset
    if not ALLOC_PATH.exists():
        return []
    try:
        with ALLOC_PATH.open("r", encoding="utf-8", errors="replace") as handle:
            handle.seek(alloc_offset)
            lines = handle.readlines()
            alloc_offset = handle.tell()
    except OSError:
        return []
    events = []
    for line in lines:
        parts = line.split()
        if len(parts) != 4:
            continue
        kind, address, size, allocator = parts
        if kind == "A":
            events.append({"kind": "alloc", "address": address, "sizeBytes": int(size), "allocator": "new[]" if allocator == "A" else "new"})
        elif kind == "F":
            events.append({"kind": "free", "address": address, "allocator": "delete[]" if allocator == "V" else "delete"})
    return events


def capture_record(force=False):
    global last_signature
    try:
        frame = gdb.newest_frame()
    except gdb.error:
        return False
    if not frame:
        return False
    sal = source_frame(frame)
    if not sal:
        return False
    frames = collect_frames()
    record = {
        "line": sal.line,
        "function": frame.name() or "<anonymous>",
        "frames": frames,
        "allocationEvents": read_alloc_events(),
        "heapValues": collect_pointees(frame),
        "stdout": safe_text(STDOUT_PATH),
        "stderr": safe_text(STDERR_PATH),
    }
    signature = json.dumps(record, sort_keys=True)
    if not force and signature == last_signature:
        return False
    last_signature = signature
    with TRACE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, separators=(",", ":")) + "\n")
    return True


def on_exit(event):
    global exit_code
    exit_code = getattr(event, "exit_code", None)


def on_stop(event):
    global last_signal
    if isinstance(event, gdb.SignalEvent):
        last_signal = event.stop_signal


gdb.events.exited.connect(on_exit)
gdb.events.stop.connect(on_stop)
gdb.execute("set pagination off")
gdb.execute("set confirm off")
gdb.execute("set print pretty off")
gdb.execute("set print elements 64")
gdb.execute("set disable-randomization on")
gdb.execute("break main", to_string=True)

steps = 0
try:
    gdb.execute("run < /work/stdin.txt > /work/stdout.txt 2> /work/stderr.txt", to_string=True)
    while steps < MAX_STEPS:
        if capture_record(force=steps == 0):
            steps += 1
        if last_signal and last_signal not in ("SIGTRAP",):
            break
        try:
            gdb.execute("step", to_string=True)
        except gdb.error as error:
            message = str(error).lower()
            if "not being run" in message or "exited" in message:
                break
            try:
                gdb.execute("finish", to_string=True)
            except gdb.error:
                break
except gdb.error as error:
    META_PATH.write_text(json.dumps({"exitCode": exit_code, "signal": last_signal, "gdbError": str(error), "steps": steps}), encoding="utf-8")
else:
    META_PATH.write_text(json.dumps({"exitCode": exit_code, "signal": last_signal, "steps": steps, "stepLimit": steps >= MAX_STEPS}), encoding="utf-8")
