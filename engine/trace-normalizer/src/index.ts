import { createHash } from "node:crypto";
import { pointersAtStep } from "@seeplusplus/memory-model";
import {
  ProgramTraceSchema,
  type CompilerDiagnostic,
  type ExecutionStep,
  type HeapObject,
  type ProgramTrace,
  type RuntimeValue,
  type StackFrame,
  type StepDelta,
  type TerminalKind,
  type VariableBinding,
} from "@seeplusplus/trace-schema";

export interface RawAllocationEvent {
  kind: "alloc" | "free";
  address: string;
  sizeBytes?: number;
  allocator?: "new" | "new[]" | "delete" | "delete[]" | "malloc" | "free";
}
export interface RawTraceRecord {
  line: number | null;
  column?: number;
  function?: string;
  event?: "line" | "exception" | "signal";
  frames: StackFrame[];
  globals?: VariableBinding[];
  allocationEvents?: RawAllocationEvent[];
  heapValues?: Array<{ address: string; typeName: string; value: RuntimeValue }>;
  stdout?: string;
  stderr?: string;
}
export interface RawRunResult {
  compile: {
    exitCode: number;
    stdout: string;
    stderr: string;
    diagnostics: CompilerDiagnostic[];
    compilerName: "g++" | "clang++";
    compilerVersion: string;
    flags: string[];
  };
  records?: RawTraceRecord[];
  runtime?: { exitCode: number | null; signal?: string; stdout: string; stderr: string };
  terminalKind: TerminalKind;
  terminalMessage?: string;
  tracer: { name: string; version: string; imageDigest: string };
}
export interface NormalizeInput {
  runId: string;
  source: string;
  languageMode: "cpp17" | "cpp20";
  cacheKey: string;
  createdAt?: string;
  limits: { maxSteps: number; timeoutMs: number; memoryMb: number; maxOutputBytes: number };
}

function normalizeAddress(address: string): string {
  if (!address || address === "0" || address === "0x0" || address === "(nil)") return "0x0";
  const parsed = Number.parseInt(address.replace(/^0x/, ""), 16);
  return Number.isFinite(parsed) ? `0x${parsed.toString(16)}` : address;
}

function resolveValue(
  value: RuntimeValue,
  liveByAddress: Map<string, HeapObject>,
  freedByAddress: Map<string, HeapObject>,
): RuntimeValue {
  if (value.kind === "pointer" || value.kind === "reference") {
    const address = value.targetAddress ? normalizeAddress(value.targetAddress) : null;
    if (!address || address === "0x0") {
      return value.kind === "pointer"
        ? {
            ...value,
            targetAddress: null,
            state: value.state === "uninitialized" ? "uninitialized" : "null",
          }
        : { ...value, targetAddress: null, state: "unknown" };
    }
    const live = liveByAddress.get(address);
    if (live)
      return { ...value, targetAddress: address, targetObjectId: live.objectId, state: "valid" };
    const freed = freedByAddress.get(address);
    if (freed)
      return {
        ...value,
        targetAddress: address,
        targetObjectId: freed.objectId,
        state: "dangling",
      };
    return { ...value, targetAddress: address, state: "unknown" };
  }
  if (value.kind === "array")
    return {
      ...value,
      elements: value.elements.map((element) =>
        resolveValue(element, liveByAddress, freedByAddress),
      ),
    };
  if (value.kind === "object")
    return {
      ...value,
      fields: value.fields.map((field) => ({
        ...field,
        value: resolveValue(field.value, liveByAddress, freedByAddress),
      })),
    };
  return value;
}

function resolveBinding(
  binding: VariableBinding,
  live: Map<string, HeapObject>,
  freed: Map<string, HeapObject>,
): VariableBinding {
  return { ...binding, value: resolveValue(binding.value, live, freed) };
}

function pointerEdgeIds(step: ExecutionStep): Set<string> {
  return new Set(
    pointersAtStep(step)
      .filter((pointer) => pointer.targetObjectId)
      .map((pointer) => `${pointer.id}->${pointer.targetObjectId}`),
  );
}

function changedBindingIds(previous: ExecutionStep | undefined, current: ExecutionStep): string[] {
  if (!previous)
    return current.frames
      .flatMap((frame) => [...frame.parameters, ...frame.locals])
      .map((binding) => binding.id);
  const previousValues = new Map(
    [
      ...previous.globals,
      ...previous.frames.flatMap((frame) => [...frame.parameters, ...frame.locals]),
    ].map((binding) => [binding.id, JSON.stringify(binding.value)]),
  );
  return [
    ...current.globals,
    ...current.frames.flatMap((frame) => [...frame.parameters, ...frame.locals]),
  ]
    .filter((binding) => previousValues.get(binding.id) !== JSON.stringify(binding.value))
    .map((binding) => binding.id);
}

function computeDelta(previous: ExecutionStep | undefined, current: ExecutionStep): StepDelta {
  const previousFrames = new Set(previous?.frames.map((frame) => frame.frameId) ?? []);
  const currentFrames = new Set(current.frames.map((frame) => frame.frameId));
  const previousObjects = new Set(previous?.heap.live.map((object) => object.objectId) ?? []);
  const currentObjects = new Set(current.heap.live.map((object) => object.objectId));
  const previousEdges = previous ? pointerEdgeIds(previous) : new Set<string>();
  const currentEdges = pointerEdgeIds(current);
  const previousOutput = previous?.io.stdout ?? "";
  return {
    framesAdded: [...currentFrames].filter((id) => !previousFrames.has(id)),
    framesRemoved: [...previousFrames].filter((id) => !currentFrames.has(id)),
    variablesChanged: changedBindingIds(previous, current),
    allocationsAdded: [...currentObjects].filter((id) => !previousObjects.has(id)),
    frees: [...previousObjects].filter((id) => !currentObjects.has(id)),
    pointerEdgesAdded: [...currentEdges].filter((id) => !previousEdges.has(id)),
    pointerEdgesRemoved: [...previousEdges].filter((id) => !currentEdges.has(id)),
    stdoutAppended: current.io.stdout.startsWith(previousOutput)
      ? current.io.stdout.slice(previousOutput.length)
      : current.io.stdout,
    diagnosticsRaised: [],
  };
}

export function normalizeRun(raw: RawRunResult, input: NormalizeInput): ProgramTrace {
  const liveByAddress = new Map<string, HeapObject>();
  const freedByAddress = new Map<string, HeapObject>();
  const generation = new Map<string, number>();
  const steps: ExecutionStep[] = [];
  let previousDepth = 0;

  for (const record of (raw.records ?? []).slice(0, input.limits.maxSteps)) {
    const index = steps.length;
    for (const event of record.allocationEvents ?? []) {
      const address = normalizeAddress(event.address);
      if (event.kind === "alloc") {
        const nextGeneration = (generation.get(address) ?? 0) + 1;
        generation.set(address, nextGeneration);
        liveByAddress.set(address, {
          objectId: `heap:${address}:${nextGeneration}`,
          address,
          ...(event.sizeBytes === undefined ? {} : { sizeBytes: event.sizeBytes }),
          allocation: record.line ? { file: "source.cpp", line: record.line } : null,
          allocatedAtStep: index,
        });
        freedByAddress.delete(address);
      } else {
        const object = liveByAddress.get(address);
        if (object) {
          const freed = { ...object, freedAtStep: index };
          liveByAddress.delete(address);
          freedByAddress.set(address, freed);
        }
      }
    }
    for (const heapValue of record.heapValues ?? []) {
      const object = liveByAddress.get(normalizeAddress(heapValue.address));
      if (object) {
        object.typeName = heapValue.typeName;
        object.value = resolveValue(heapValue.value, liveByAddress, freedByAddress);
      }
    }
    const depth = record.frames.length;
    const event =
      record.event ?? (depth > previousDepth ? "call" : depth < previousDepth ? "return" : "line");
    const frames = record.frames.map((frame) => ({
      ...frame,
      parameters: frame.parameters.map((binding) =>
        resolveBinding(binding, liveByAddress, freedByAddress),
      ),
      locals: frame.locals.map((binding) => resolveBinding(binding, liveByAddress, freedByAddress)),
    }));
    const pointers = frames
      .flatMap((frame) => [...frame.parameters, ...frame.locals])
      .flatMap((binding) => (binding.value.kind === "pointer" ? [binding.value] : []));
    for (const pointer of pointers) {
      if (!pointer.targetObjectId) continue;
      const object = liveByAddress.get(pointer.targetAddress ?? "");
      if (object && !object.typeName)
        object.typeName = pointer.pointerType.replace(/\s*\*+\s*$/, "");
    }
    const step: ExecutionStep = {
      index,
      event,
      location: record.line
        ? {
            file: "source.cpp",
            line: record.line,
            ...(record.column ? { column: record.column } : {}),
          }
        : null,
      ...(record.function ? { function: { name: record.function } } : {}),
      frames,
      globals: (record.globals ?? []).map((binding) =>
        resolveBinding(binding, liveByAddress, freedByAddress),
      ),
      heap: {
        live: [...liveByAddress.values()].map((object) => ({ ...object })),
        recentlyFreed: [...freedByAddress.values()].filter(
          (object) => object.freedAtStep === index,
        ),
      },
      io: { stdout: record.stdout ?? "", stderr: record.stderr ?? "" },
    };
    step.delta = computeDelta(steps.at(-1), step);
    steps.push(step);
    previousDepth = depth;
  }

  const trace: ProgramTrace = {
    schemaVersion: "1.0",
    run: {
      runId: input.runId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      compiler: {
        name: raw.compile.compilerName,
        version: raw.compile.compilerVersion,
        flags: raw.compile.flags,
      },
      tracer: raw.tracer,
      limits: input.limits,
      cacheKey: input.cacheKey,
    },
    source: {
      filename: "source.cpp",
      languageMode: input.languageMode,
      text: input.source,
      sha256: createHash("sha256").update(input.source).digest("hex"),
    },
    build: {
      success: raw.compile.exitCode === 0,
      exitCode: raw.compile.exitCode,
      stdout: raw.compile.stdout,
      stderr: raw.compile.stderr,
      diagnostics: raw.compile.diagnostics,
    },
    steps,
    terminal: {
      kind: raw.terminalKind,
      ...(raw.runtime ? { exitCode: raw.runtime.exitCode } : {}),
      ...(raw.runtime?.signal ? { signal: raw.runtime.signal } : {}),
      ...(raw.terminalMessage ? { message: raw.terminalMessage } : {}),
    },
  };
  return ProgramTraceSchema.parse(trace);
}

export function computeCacheKey(
  source: string,
  stdin: string,
  toolchain: string,
  schema = "1.0",
): string {
  return createHash("sha256")
    .update([source.replace(/\r\n/g, "\n"), stdin, toolchain, schema].join("\0"))
    .digest("hex");
}

export function parseGccDiagnostics(stderr: string): CompilerDiagnostic[] {
  const pattern =
    /(?:^|\n)(?:\/work\/)?source\.cpp:(\d+):(\d+):\s+(fatal error|error|warning|note):\s+([^\n]+)/g;
  return [...stderr.matchAll(pattern)].map((match) => ({
    line: Number(match[1]),
    column: Number(match[2]),
    severity:
      match[3] === "fatal error" ? ("fatal" as const) : (match[3] as "error" | "warning" | "note"),
    message: match[4]?.trim() ?? "Compiler diagnostic",
  }));
}
