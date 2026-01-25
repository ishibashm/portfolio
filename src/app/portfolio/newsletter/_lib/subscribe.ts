"use server";

import { ActionResult, error, success } from "./utils";
import { newsletterSchema } from "./schema";

// Mock implementation
export const subscribe = async (email: string): Promise<ActionResult<string>> => {
  const parsed = newsletterSchema.safeParse({ email });

  if (!parsed.success) {
    return error(parsed.error.message);
  }

  try {
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Always succeed in demo
    return success("Thank you for subscribing! (Demo Mode)");
  } catch (err) {
    return error(err instanceof Error ? err.message : "Error subscribing");
  }
};

export const getDemoState = async () => {
  return true;
};
