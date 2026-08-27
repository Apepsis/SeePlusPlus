import type {
  ExecutionStep,
  HeapObject,
  ProgramTrace,
  RuntimeValue,
  VariableBinding,
} from "@seeplusplus/trace-schema";

export interface PointerBinding {
  id: string;
  name: string;
  sourceKind: "variable" | "field" | "array-element";
  targetAddress: string | null;
  targetObjectId?: string;
  state: "valid" | "null" | "dangling" | "unknown" | "uninitialized";
  value: RuntimeValue;
}

function pointerFromValue(
  value: RuntimeValue,
  id: string,
  name: string,
  sourceKind: PointerBinding["sourceKind"],
): PointerBinding[] {
  if (value.kind === "pointer") {
    return [
      {
        id,
        name,
        sourceKind,
        targetAddress: value.targetAddress,
        ...(value.targetObjectId ? { targetObjectId: value.targetObjectId } : {}),
        state: value.state,
        value,
      },
    ];
  }
  if (value.kind === "reference") {
    return [
      {
        id,
        name,
        sourceKind,
        targetAddress: value.targetAddress,
        ...(value.targetObjectId ? { targetObjectId: value.targetObjectId } : {}),
        state: value.state,
        value,
      },
    ];
  }
  if (value.kind === "object") {
    return value.fields.flatMap((field) =>
      pointerFromValue(field.value, `${id}.${field.name}`, field.name, "field"),
    );
  }
  if (value.kind === "array") {
    return value.elements.flatMap((element, index) =>
      pointerFromValue(element, `${id}[${index}]`, `[${index}]`, "array-element"),
    );
  }
  return [];
}

export function pointersInBinding(binding: VariableBinding): PointerBinding[] {
  return pointerFromValue(binding.value, binding.id, binding.name, "variable");
}

export function pointersAtStep(step: ExecutionStep): PointerBinding[] {
  const bindings = [
    ...step.globals,
    ...step.frames.flatMap((frame) => [...frame.parameters, ...frame.locals]),
  ];
  const heapPointers = step.heap.live.flatMap((object) =>
    object.value
      ? pointerFromValue(object.value, object.objectId, object.typeName ?? object.objectId, "field")
      : [],
  );
  return [...bindings.flatMap(pointersInBinding), ...heapPointers];
}

export function liveHeapAt(trace: ProgramTrace, stepIndex: number): Map<string, HeapObject> {
  return new Map(
    trace.steps[stepIndex]?.heap.live.map((object) => [object.objectId, object]) ?? [],
  );
}

export function reachableHeapObjectIds(step: ExecutionStep): Set<string> {
  const objects = new Map(step.heap.live.map((object) => [object.objectId, object]));
  const roots = pointersAtStep(step)
    .filter((pointer) => pointer.sourceKind === "variable" && pointer.targetObjectId)
    .map((pointer) => pointer.targetObjectId as string);
  const reachable = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const objectId = queue.shift() as string;
    if (reachable.has(objectId)) continue;
    reachable.add(objectId);
    const object = objects.get(objectId);
    if (!object?.value) continue;
    for (const pointer of pointerFromValue(object.value, objectId, objectId, "field")) {
      if (pointer.targetObjectId && !reachable.has(pointer.targetObjectId))
        queue.push(pointer.targetObjectId);
    }
  }
  return reachable;
}

export function findBinding(step: ExecutionStep, bindingId: string): VariableBinding | undefined {
  return [
    ...step.globals,
    ...step.frames.flatMap((frame) => [...frame.parameters, ...frame.locals]),
  ].find((binding) => binding.id === bindingId);
}
