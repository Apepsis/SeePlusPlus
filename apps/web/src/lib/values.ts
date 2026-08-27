import type { RuntimeValue } from "@seeplusplus/trace-schema";

export function renderValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "scalar":
      return typeof value.value === "string" ? value.value : String(value.value);
    case "pointer":
      return value.state === "null" ? "nullptr" : (value.targetAddress ?? "?");
    case "reference":
      return value.targetAddress ?? "?";
    case "array":
      return `[${value.elements.map(renderValue).join(", ")}${value.truncated ? ", …" : ""}]`;
    case "object":
      return (
        value.rendered ??
        `{ ${value.fields.map((field) => `${field.name}: ${renderValue(field.value)}`).join(", ")} }`
      );
    case "uninitialized":
      return "?";
    case "unavailable":
      return "unavailable";
  }
}
