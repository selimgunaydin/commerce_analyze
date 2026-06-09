export function parseJSONFromModelOutput(output: string): unknown {
  const trimmed = output.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const extracted = extractLikelyJson(trimmed);

    if (!extracted) {
      throw new Error("AI output did not contain valid JSON.");
    }

    return JSON.parse(extracted);
  }
}

export function buildRepairPrompt(params: {
  schemaName: string;
  invalidOutput: string;
  validationError: string;
}) {
  return [
    `Repair this ${params.schemaName} JSON output.`,
    "Return only valid JSON. Do not include markdown. Do not include commentary.",
    "Preserve the original meaning where possible.",
    `Validation error: ${params.validationError}`,
    "Invalid output:",
    params.invalidOutput
  ].join("\n");
}

function extractLikelyJson(output: string) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstObject = output.indexOf("{");
  const lastObject = output.lastIndexOf("}");

  if (firstObject >= 0 && lastObject > firstObject) {
    return output.slice(firstObject, lastObject + 1);
  }

  const firstArray = output.indexOf("[");
  const lastArray = output.lastIndexOf("]");

  if (firstArray >= 0 && lastArray > firstArray) {
    return output.slice(firstArray, lastArray + 1);
  }

  return null;
}
