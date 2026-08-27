import {
  ProgramTraceSchema,
  type ProgramTrace,
  type RuntimeValue,
  type VariableBinding,
} from "@seeplusplus/trace-schema";

export interface ExampleDefinition {
  slug: string;
  title: string;
  category: string;
  description: string;
  code: string;
  expectedFeatures: string[];
  trace: ProgramTrace;
}

const scalar = (value: number, scalarType = "int"): RuntimeValue => ({
  kind: "scalar",
  scalarType,
  value,
});
const pointer = (
  address: string | null,
  objectId?: string,
  state: "valid" | "null" | "dangling" = address ? "valid" : "null",
): RuntimeValue => ({
  kind: "pointer",
  pointerType: "int *",
  targetAddress: address,
  ...(objectId ? { targetObjectId: objectId } : {}),
  state,
});
const binding = (
  id: string,
  name: string,
  value: RuntimeValue,
  declaredType = "int",
): VariableBinding => ({
  id,
  name,
  declaredType,
  storage: "local",
  value,
  initialized: true,
});

function baseTrace(
  code: string,
  frames: Array<{
    line: number;
    locals: VariableBinding[];
    heap?: ProgramTrace["steps"][number]["heap"];
    event?: ProgramTrace["steps"][number]["event"];
  }>,
  terminal: ProgramTrace["terminal"] = { kind: "success", exitCode: 0 },
): ProgramTrace {
  const trace: ProgramTrace = {
    schemaVersion: "1.0",
    run: {
      runId: "pages-golden-fixture",
      createdAt: "2026-08-27T00:00:00.000Z",
      compiler: { name: "g++", version: "13.3.0", flags: ["-std=c++20", "-g3", "-O0"] },
      tracer: { name: "golden-test-fixture", version: "1.0.0", imageDigest: "fixture-only" },
      limits: { maxSteps: 1000, timeoutMs: 10000, memoryMb: 512, maxOutputBytes: 65536 },
      cacheKey: "static-pages-demo",
    },
    source: { filename: "source.cpp", languageMode: "cpp20", text: code, sha256: "fixture" },
    build: { success: true, exitCode: 0, stdout: "", stderr: "", diagnostics: [] },
    steps: frames.map((item, index) => ({
      index,
      event: item.event ?? "line",
      location: { file: "source.cpp", line: item.line },
      function: { name: "main" },
      frames: [
        {
          frameId: "frame:main:1",
          function: { name: "main" },
          location: { file: "source.cpp", line: item.line },
          parameters: [],
          locals: item.locals,
        },
      ],
      globals: [],
      heap: item.heap ?? { live: [] },
      io: { stdout: "", stderr: "" },
      delta: {
        framesAdded: index === 0 ? ["frame:main:1"] : [],
        framesRemoved: [],
        variablesChanged: item.locals.map((item) => item.id),
        allocationsAdded: [],
        frees: [],
        pointerEdgesAdded: [],
        pointerEdgesRemoved: [],
        stdoutAppended: "",
        diagnosticsRaised: [],
      },
    })),
    terminal,
  };
  return ProgramTraceSchema.parse(trace);
}

const pointerCode = `#include <iostream>

int main() {
  int x = 10;
  int* p = &x;
  int* q = p;
  *q = 25;
  std::cout << x << '\\n';
  return 0;
}`;

const heapCode = `#include <iostream>

int main() {
  int* p = new int(42);
  int* q = p;
  delete p;
  std::cout << "freed" << '\\n';
  return 0;
}`;
const heapObject = {
  objectId: "heap:0x1000:1",
  address: "0x1000",
  sizeBytes: 4,
  typeName: "int",
  allocation: { file: "source.cpp", line: 4 },
  allocatedAtStep: 1,
  value: scalar(42),
} as const;

const listCode = `struct Node { int value; Node* next; };

int main() {
  Node* head = new Node{1, nullptr};
  head->next = new Node{2, nullptr};
  head->next->next = new Node{3, nullptr};
  delete head->next->next;
  delete head->next;
  delete head;
}`;
const nodeValue = (value: number, next: RuntimeValue): RuntimeValue => ({
  kind: "object",
  typeName: "Node",
  fields: [
    { name: "value", value: scalar(value) },
    { name: "next", value: next },
  ],
});
const node1 = {
  objectId: "heap:0x1100:1",
  address: "0x1100",
  sizeBytes: 16,
  typeName: "Node",
  allocation: { file: "source.cpp", line: 4 },
  allocatedAtStep: 1,
  value: nodeValue(1, {
    kind: "pointer",
    pointerType: "Node *",
    targetAddress: null,
    state: "null",
  }),
};
const node2 = {
  objectId: "heap:0x1200:1",
  address: "0x1200",
  sizeBytes: 16,
  typeName: "Node",
  allocation: { file: "source.cpp", line: 5 },
  allocatedAtStep: 2,
  value: nodeValue(2, {
    kind: "pointer",
    pointerType: "Node *",
    targetAddress: null,
    state: "null",
  }),
};
const node3 = {
  objectId: "heap:0x1300:1",
  address: "0x1300",
  sizeBytes: 16,
  typeName: "Node",
  allocation: { file: "source.cpp", line: 6 },
  allocatedAtStep: 3,
  value: nodeValue(3, {
    kind: "pointer",
    pointerType: "Node *",
    targetAddress: null,
    state: "null",
  }),
};

export const examples: ExampleDefinition[] = [
  {
    slug: "pointer-aliasing",
    title: "Pointer aliasing",
    category: "Pointers",
    description: "Two pointer bindings target the same stack value.",
    expectedFeatures: ["pointers", "aliasing", "stack"],
    code: pointerCode,
    trace: baseTrace(pointerCode, [
      { line: 4, locals: [binding("main:x", "x", scalar(10))] },
      {
        line: 5,
        locals: [
          binding("main:x", "x", scalar(10)),
          binding(
            "main:p",
            "p",
            {
              kind: "pointer",
              pointerType: "int *",
              targetAddress: "0x7fff1000",
              state: "unknown",
            },
            "int *",
          ),
        ],
      },
      {
        line: 6,
        locals: [
          binding("main:x", "x", scalar(10)),
          binding(
            "main:p",
            "p",
            {
              kind: "pointer",
              pointerType: "int *",
              targetAddress: "0x7fff1000",
              state: "unknown",
            },
            "int *",
          ),
          binding(
            "main:q",
            "q",
            {
              kind: "pointer",
              pointerType: "int *",
              targetAddress: "0x7fff1000",
              state: "unknown",
            },
            "int *",
          ),
        ],
      },
      {
        line: 7,
        locals: [
          binding("main:x", "x", scalar(25)),
          binding(
            "main:p",
            "p",
            {
              kind: "pointer",
              pointerType: "int *",
              targetAddress: "0x7fff1000",
              state: "unknown",
            },
            "int *",
          ),
          binding(
            "main:q",
            "q",
            {
              kind: "pointer",
              pointerType: "int *",
              targetAddress: "0x7fff1000",
              state: "unknown",
            },
            "int *",
          ),
        ],
      },
    ]),
  },
  {
    slug: "heap-lifetime",
    title: "Heap lifetime",
    category: "Memory",
    description: "Allocation, aliasing, deletion and dangling pointers.",
    expectedFeatures: ["allocation", "free", "dangling"],
    code: heapCode,
    trace: baseTrace(heapCode, [
      { line: 4, locals: [] },
      {
        line: 5,
        locals: [binding("main:p", "p", pointer("0x1000", heapObject.objectId), "int *")],
        heap: { live: [heapObject] },
      },
      {
        line: 6,
        locals: [
          binding("main:p", "p", pointer("0x1000", heapObject.objectId), "int *"),
          binding("main:q", "q", pointer("0x1000", heapObject.objectId), "int *"),
        ],
        heap: { live: [heapObject] },
      },
      {
        line: 7,
        locals: [
          binding("main:p", "p", pointer("0x1000", heapObject.objectId, "dangling"), "int *"),
          binding("main:q", "q", pointer("0x1000", heapObject.objectId, "dangling"), "int *"),
        ],
        heap: { live: [], recentlyFreed: [{ ...heapObject, freedAtStep: 3 }] },
      },
    ]),
  },
  {
    slug: "linked-list",
    title: "Linked list",
    category: "Data structures",
    description: "Three generic heap objects connected by pointer fields.",
    expectedFeatures: ["structs", "linked-list", "graph"],
    code: listCode,
    trace: baseTrace(listCode, [
      { line: 4, locals: [] },
      {
        line: 5,
        locals: [
          binding(
            "main:head",
            "head",
            {
              kind: "pointer",
              pointerType: "Node *",
              targetAddress: "0x1100",
              targetObjectId: node1.objectId,
              state: "valid",
            },
            "Node *",
          ),
        ],
        heap: { live: [node1] },
      },
      {
        line: 6,
        locals: [
          binding(
            "main:head",
            "head",
            {
              kind: "pointer",
              pointerType: "Node *",
              targetAddress: "0x1100",
              targetObjectId: node1.objectId,
              state: "valid",
            },
            "Node *",
          ),
        ],
        heap: {
          live: [
            {
              ...node1,
              value: nodeValue(1, {
                kind: "pointer",
                pointerType: "Node *",
                targetAddress: "0x1200",
                targetObjectId: node2.objectId,
                state: "valid",
              }),
            },
            node2,
          ],
        },
      },
      {
        line: 7,
        locals: [
          binding(
            "main:head",
            "head",
            {
              kind: "pointer",
              pointerType: "Node *",
              targetAddress: "0x1100",
              targetObjectId: node1.objectId,
              state: "valid",
            },
            "Node *",
          ),
        ],
        heap: {
          live: [
            {
              ...node1,
              value: nodeValue(1, {
                kind: "pointer",
                pointerType: "Node *",
                targetAddress: "0x1200",
                targetObjectId: node2.objectId,
                state: "valid",
              }),
            },
            {
              ...node2,
              value: nodeValue(2, {
                kind: "pointer",
                pointerType: "Node *",
                targetAddress: "0x1300",
                targetObjectId: node3.objectId,
                state: "valid",
              }),
            },
            node3,
          ],
        },
      },
    ]),
  },
];

export const supportMatrix = [
  {
    id: "primitive",
    status: "supported",
    tests: ["primitive.cpp"],
    notes: "Scalars visible through DWARF/GDB.",
  },
  {
    id: "calls",
    status: "supported",
    tests: ["call.cpp", "recursion.cpp"],
    notes: "Frame identity uses stack pointer plus function.",
  },
  {
    id: "pointers",
    status: "supported",
    tests: ["pointer.cpp", "heap.cpp"],
    notes: "Heap generation resolution is exact for intercepted new/delete.",
  },
  {
    id: "references",
    status: "experimental",
    tests: ["reference.cpp"],
    notes: "Debugger availability depends on ABI metadata.",
  },
  {
    id: "arrays",
    status: "supported",
    tests: ["array.cpp"],
    notes: "Inspection is capped at 64 elements.",
  },
  {
    id: "structs",
    status: "supported",
    tests: ["list.cpp", "tree.cpp"],
    notes: "Fields derive from debug metadata.",
  },
  {
    id: "new-delete",
    status: "supported",
    tests: ["heap.cpp", "leak.cpp"],
    notes: "Custom new/delete definitions remain unsupported.",
  },
  {
    id: "stl",
    status: "experimental",
    tests: ["vector.cpp"],
    notes: "Rendered as debugger-native types; no simplified adapter yet.",
  },
  {
    id: "smart-pointers",
    status: "experimental",
    tests: ["unique_ptr.cpp"],
    notes:
      "Raw fields are visible; ownership edges are not yet guaranteed across libstdc++ versions.",
  },
  {
    id: "threads",
    status: "unsupported",
    tests: [],
    notes: "No deterministic multi-thread event ordering in schema v1.",
  },
] as const;

export function exampleBySlug(slug: string): ExampleDefinition | undefined {
  return examples.find((example) => example.slug === slug);
}
