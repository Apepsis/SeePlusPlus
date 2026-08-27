import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const TRACE_SCHEMA_VERSION = "1.0" as const;

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
});

export const FunctionIdentitySchema = z.object({
  name: z.string(),
  qualifiedName: z.string().optional(),
  signature: z.string().optional(),
});

export const RuntimeValueSchema: z.ZodType<RuntimeValue> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("scalar"),
      scalarType: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }),
    z.object({
      kind: z.literal("pointer"),
      pointerType: z.string(),
      targetAddress: z.string().nullable(),
      targetObjectId: z.string().optional(),
      state: z.enum(["valid", "null", "dangling", "unknown", "uninitialized"]),
    }),
    z.object({
      kind: z.literal("reference"),
      referenceType: z.string(),
      targetAddress: z.string().nullable(),
      targetObjectId: z.string().optional(),
      state: z.enum(["valid", "dangling", "unknown"]),
    }),
    z.object({
      kind: z.literal("array"),
      typeName: z.string(),
      elements: z.array(RuntimeValueSchema),
      truncated: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal("object"),
      typeName: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          value: RuntimeValueSchema,
          offsetBytes: z.number().int().nonnegative().optional(),
        }),
      ),
      rendered: z.string().optional(),
    }),
    z.object({ kind: z.literal("uninitialized"), typeName: z.string() }),
    z.object({
      kind: z.literal("unavailable"),
      typeName: z.string().optional(),
      reason: z.string(),
    }),
  ]),
);

export const VariableBindingSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  declaredType: z.string(),
  storage: z.enum(["local", "parameter", "global", "static"]),
  value: RuntimeValueSchema,
  address: z.string().optional(),
  initialized: z.union([z.boolean(), z.literal("unknown")]),
});

export const StackFrameSchema = z.object({
  frameId: z.string().min(1),
  function: FunctionIdentitySchema,
  location: SourceLocationSchema.optional(),
  parameters: z.array(VariableBindingSchema),
  locals: z.array(VariableBindingSchema),
});

export const HeapObjectSchema = z.object({
  objectId: z.string().min(1),
  address: z.string(),
  sizeBytes: z.number().int().nonnegative().optional(),
  typeName: z.string().optional(),
  allocation: SourceLocationSchema.nullable(),
  allocatedAtStep: z.number().int().nonnegative(),
  freedAtStep: z.number().int().nonnegative().optional(),
  value: RuntimeValueSchema.optional(),
});

export const StepDeltaSchema = z.object({
  framesAdded: z.array(z.string()).default([]),
  framesRemoved: z.array(z.string()).default([]),
  variablesChanged: z.array(z.string()).default([]),
  allocationsAdded: z.array(z.string()).default([]),
  frees: z.array(z.string()).default([]),
  pointerEdgesAdded: z.array(z.string()).default([]),
  pointerEdgesRemoved: z.array(z.string()).default([]),
  stdoutAppended: z.string().default(""),
  diagnosticsRaised: z.array(z.string()).default([]),
});

export const ExecutionStepSchema = z.object({
  index: z.number().int().nonnegative(),
  event: z.enum(["line", "call", "return", "exception", "signal", "allocation", "free"]),
  location: SourceLocationSchema.nullable(),
  function: FunctionIdentitySchema.optional(),
  frames: z.array(StackFrameSchema),
  globals: z.array(VariableBindingSchema),
  heap: z.object({
    live: z.array(HeapObjectSchema),
    recentlyFreed: z.array(HeapObjectSchema).optional(),
  }),
  io: z.object({ stdout: z.string(), stderr: z.string() }),
  delta: StepDeltaSchema.optional(),
});

export const CompilerDiagnosticSchema = z.object({
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  severity: z.enum(["note", "warning", "error", "fatal"]),
  message: z.string(),
});

export const TerminalKindSchema = z.enum([
  "success",
  "compile_failure",
  "runtime_error",
  "signal",
  "timeout",
  "memory_limit",
  "output_limit",
  "sandbox_violation",
  "tracer_error",
  "internal_error",
]);

export const ProgramTraceSchema = z
  .object({
    schemaVersion: z.literal(TRACE_SCHEMA_VERSION),
    run: z.object({
      runId: z.string().min(1),
      createdAt: z.string().datetime(),
      compiler: z.object({
        name: z.enum(["g++", "clang++"]),
        version: z.string(),
        flags: z.array(z.string()),
      }),
      tracer: z.object({
        name: z.string(),
        version: z.string(),
        imageDigest: z.string(),
      }),
      limits: z.object({
        maxSteps: z.number().int().positive(),
        timeoutMs: z.number().int().positive(),
        memoryMb: z.number().int().positive(),
        maxOutputBytes: z.number().int().positive(),
      }),
      cacheKey: z.string(),
    }),
    source: z.object({
      filename: z.string(),
      languageMode: z.enum(["cpp17", "cpp20"]),
      text: z.string(),
      sha256: z.string(),
    }),
    build: z.object({
      success: z.boolean(),
      exitCode: z.number().int(),
      stdout: z.string(),
      stderr: z.string(),
      diagnostics: z.array(CompilerDiagnosticSchema),
    }),
    steps: z.array(ExecutionStepSchema),
    terminal: z.object({
      kind: TerminalKindSchema,
      exitCode: z.number().int().nullable().optional(),
      signal: z.string().optional(),
      message: z.string().optional(),
    }),
  })
  .superRefine((trace, context) => {
    for (let index = 0; index < trace.steps.length; index += 1) {
      if (trace.steps[index]?.index !== index) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step indexes must be contiguous; expected ${index}`,
          path: ["steps", index, "index"],
        });
      }
    }
    if (!trace.build.success && trace.steps.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Compile failures cannot contain execution steps",
        path: ["steps"],
      });
    }
  });

export const FindingSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "leak",
    "dangling-pointer",
    "use-after-free",
    "double-free",
    "null-deref",
    "uninitialized-read",
    "ownership",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  confidence: z.enum(["certain", "high", "heuristic"]),
  title: z.string(),
  summary: z.string(),
  firstStep: z.number().int().nonnegative(),
  lastStep: z.number().int().nonnegative().optional(),
  locations: z.array(SourceLocationSchema),
  objectIds: z.array(z.string()).optional(),
  evidence: z.array(
    z.object({
      step: z.number().int().nonnegative(),
      description: z.string(),
      location: SourceLocationSchema.optional(),
      variableId: z.string().optional(),
      objectId: z.string().optional(),
    }),
  ),
  conceptTags: z.array(z.string()),
});

export const RunResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["complete", "running"]),
  cacheHit: z.boolean(),
  trace: ProgramTraceSchema.optional(),
  findings: z.array(FindingSchema).optional(),
});

export interface RuntimeValueScalar {
  kind: "scalar";
  scalarType: string;
  value: string | number | boolean | null;
}
export interface RuntimeValuePointer {
  kind: "pointer";
  pointerType: string;
  targetAddress: string | null;
  targetObjectId?: string;
  state: "valid" | "null" | "dangling" | "unknown" | "uninitialized";
}
export interface RuntimeValueReference {
  kind: "reference";
  referenceType: string;
  targetAddress: string | null;
  targetObjectId?: string;
  state: "valid" | "dangling" | "unknown";
}
export interface RuntimeValueArray {
  kind: "array";
  typeName: string;
  elements: RuntimeValue[];
  truncated?: boolean;
}
export interface RuntimeValueObject {
  kind: "object";
  typeName: string;
  fields: Array<{ name: string; value: RuntimeValue; offsetBytes?: number }>;
  rendered?: string;
}
export interface RuntimeValueUninitialized {
  kind: "uninitialized";
  typeName: string;
}
export interface RuntimeValueUnavailable {
  kind: "unavailable";
  typeName?: string;
  reason: string;
}
export type RuntimeValue =
  | RuntimeValueScalar
  | RuntimeValuePointer
  | RuntimeValueReference
  | RuntimeValueArray
  | RuntimeValueObject
  | RuntimeValueUninitialized
  | RuntimeValueUnavailable;

export type SourceLocation = z.infer<typeof SourceLocationSchema>;
export type FunctionIdentity = z.infer<typeof FunctionIdentitySchema>;
export type VariableBinding = z.infer<typeof VariableBindingSchema>;
export type StackFrame = z.infer<typeof StackFrameSchema>;
export type HeapObject = z.infer<typeof HeapObjectSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export type StepDelta = z.infer<typeof StepDeltaSchema>;
export type ProgramTrace = z.infer<typeof ProgramTraceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
export type TerminalKind = z.infer<typeof TerminalKindSchema>;
export type CompilerDiagnostic = z.infer<typeof CompilerDiagnosticSchema>;

export const programTraceJsonSchema = zodToJsonSchema(ProgramTraceSchema, {
  name: "ProgramTraceV1",
  target: "jsonSchema7",
});

export function validateTrace(value: unknown): ProgramTrace {
  return ProgramTraceSchema.parse(value);
}
