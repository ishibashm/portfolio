/** JSON object key order is irrelevant; array order and tool names are not. */
export function toolCallKey(
  name: string,
  input: Record<string, unknown>,
): string {
  return JSON.stringify([name, input], (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, value[key]]),
      );
    return value;
  });
}
