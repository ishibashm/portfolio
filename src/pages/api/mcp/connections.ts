import type { NextApiRequest, NextApiResponse } from "next";
import { mcpNodeEntry } from "@/lib/mcpRuntimeEntry";
export const config = {
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
};
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return mcpNodeEntry(req, res, "connections");
}
