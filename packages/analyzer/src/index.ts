import { pointersAtStep, reachableHeapObjectIds } from "@seeplusplus/memory-model";
import type { Finding, ProgramTrace, SourceLocation } from "@seeplusplus/trace-schema";

function locationList(location: SourceLocation | null | undefined): SourceLocation[] {
  return location ? [location] : [];
}

export function analyzeLeaks(trace: ProgramTrace): Finding[] {
  const finalStep = trace.steps.at(-1);
  if (!finalStep) return [];
  const reachable = reachableHeapObjectIds(finalStep);
  return finalStep.heap.live.map((object) => {
    const lost = !reachable.has(object.objectId);
    return {
      id: `leak:${object.objectId}`,
      kind: "leak",
      severity: lost ? "error" : "warning",
      confidence: lost ? "high" : "certain",
      title: lost ? "Lost heap allocation" : "Allocation remains live at exit",
      summary: lost
        ? `The allocation at ${object.address} remains live and is no longer reachable from a stack or global binding.`
        : `The allocation at ${object.address} remains live when the program terminates.`,
      firstStep: object.allocatedAtStep,
      lastStep: finalStep.index,
      locations: locationList(object.allocation),
      objectIds: [object.objectId],
      evidence: [
        {
          step: object.allocatedAtStep,
          description: `Allocation created at ${object.address}.`,
          ...(object.allocation ? { location: object.allocation } : {}),
          objectId: object.objectId,
        },
        {
          step: finalStep.index,
          description: lost
            ? "No live root reaches this object."
            : "Object is still allocated at termination.",
          objectId: object.objectId,
        },
      ],
      conceptTags: ["heap", "lifetime", "memory-leak", ...(lost ? ["reachability"] : [])],
    } satisfies Finding;
  });
}

export function analyzeDanglingPointers(trace: ProgramTrace): Finding[] {
  const firstSeen = new Map<
    string,
    { step: number; name: string; objectId?: string; location?: SourceLocation }
  >();
  for (const step of trace.steps) {
    for (const pointer of pointersAtStep(step)) {
      if (pointer.state !== "dangling") continue;
      if (!firstSeen.has(pointer.id)) {
        firstSeen.set(pointer.id, {
          step: step.index,
          name: pointer.name,
          ...(pointer.targetObjectId ? { objectId: pointer.targetObjectId } : {}),
          ...(step.location ? { location: step.location } : {}),
        });
      }
    }
  }
  return [...firstSeen.entries()].map(([bindingId, item]) => ({
    id: `dangling:${bindingId}:${item.step}`,
    kind: "dangling-pointer",
    severity: "warning",
    confidence: "high",
    title: `Dangling pointer: ${item.name}`,
    summary: `${item.name} retains an address whose allocation lifetime has ended. Reassign it or set it to nullptr after deletion.`,
    firstStep: item.step,
    locations: item.location ? [item.location] : [],
    ...(item.objectId ? { objectIds: [item.objectId] } : {}),
    evidence: [
      {
        step: item.step,
        description: `${item.name} first becomes dangling.`,
        ...(item.location ? { location: item.location } : {}),
        variableId: bindingId,
        ...(item.objectId ? { objectId: item.objectId } : {}),
      },
    ],
    conceptTags: ["pointer", "lifetime", "dangling"],
  }));
}

function stderrFinding(
  trace: ProgramTrace,
  pattern: RegExp,
  finding: Omit<Finding, "firstStep" | "locations" | "evidence">,
): Finding[] {
  const step = [...trace.steps].reverse().find((candidate) => pattern.test(candidate.io.stderr));
  if (!step) return [];
  return [
    {
      ...finding,
      firstStep: step.index,
      locations: locationList(step.location),
      evidence: [
        {
          step: step.index,
          description: "Runtime sanitizer/debugger reported this failure.",
          ...(step.location ? { location: step.location } : {}),
        },
      ],
    },
  ];
}

export function analyzeRuntimeFailures(trace: ProgramTrace): Finding[] {
  return [
    ...stderrFinding(trace, /heap-use-after-free|use after free/i, {
      id: "runtime:use-after-free",
      kind: "use-after-free",
      severity: "error",
      confidence: "certain",
      title: "Use after free",
      summary: "The program accessed an allocation after its lifetime ended.",
      conceptTags: ["heap", "lifetime", "undefined-behavior"],
    }),
    ...stderrFinding(trace, /double[- ]free|attempting free on address/i, {
      id: "runtime:double-free",
      kind: "double-free",
      severity: "error",
      confidence: "certain",
      title: "Invalid or double free",
      summary: "The runtime detected an invalid deallocation.",
      conceptTags: ["heap", "delete", "undefined-behavior"],
    }),
    ...stderrFinding(trace, /null pointer|address 0x0|cannot access memory at address 0x0/i, {
      id: "runtime:null-deref",
      kind: "null-deref",
      severity: "error",
      confidence: "high",
      title: "Null pointer dereference",
      summary: "Execution attempted to dereference a null pointer.",
      conceptTags: ["pointer", "nullptr", "undefined-behavior"],
    }),
    ...stderrFinding(trace, /uninitialized|conditional jump.*uninitial/i, {
      id: "runtime:uninitialized-read",
      kind: "uninitialized-read",
      severity: "warning",
      confidence: "high",
      title: "Uninitialized value read",
      summary: "The runtime reported a read from storage before initialization.",
      conceptTags: ["initialization", "undefined-behavior"],
    }),
  ];
}

export function analyze(trace: ProgramTrace): Finding[] {
  return [
    ...analyzeLeaks(trace),
    ...analyzeDanglingPointers(trace),
    ...analyzeRuntimeFailures(trace),
  ];
}
