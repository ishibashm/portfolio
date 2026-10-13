import type { NextApiRequest, NextApiResponse } from "next";
import { mcpNodeEntry } from "@/lib/mcpRuntimeEntry";
export const config = {
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
};
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = req.query.oauthPath;
  return mcpNodeEntry(req, res, "oauth", Array.isArray(path) ? path : []);
}
