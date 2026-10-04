import { z } from "zod";

/**
 * Minimal Zod -> JSON Schema converter covering the shapes used by this
 * server's tool inputs (objects of strings/booleans/arrays, optional,
 * .describe()). Avoids pulling in the full zod-to-json-schema package for a
 * handful of flat tool schemas.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convert(schema);
}

function convert(schema: z.ZodTypeAny): Record<string, unknown> {
  const description = (schema as any)._def?.description as string | undefined;

  let unwrapped = schema;
  let optional = false;
  while (unwrapped instanceof z.ZodOptional || unwrapped instanceof z.ZodDefault) {
    optional = true;
    unwrapped = (unwrapped as any)._def.innerType;
  }

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convert(value);
      if (!isOptional(value)) required.push(key);
    }
    return {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
      ...(description ? { description } : {}),
    };
  }

  if (unwrapped instanceof z.ZodString) {
    return { type: "string", ...(description ? { description } : {}) };
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return { type: "boolean", ...(description ? { description } : {}) };
  }

  if (unwrapped instanceof z.ZodArray) {
    return {
      type: "array",
      items: convert((unwrapped as any)._def.type),
      ...(description ? { description } : {}),
    };
  }

  if (unwrapped instanceof z.ZodNumber) {
    return { type: "number", ...(description ? { description } : {}) };
  }

  // Fallback: accept anything.
  return { ...(description ? { description } : {}) };
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}
