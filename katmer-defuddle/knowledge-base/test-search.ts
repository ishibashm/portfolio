import "dotenv/config";
import { searchInternalKnowledge } from "./src/lib/vector-search.js";

async function test() {
  try {
    console.log("Searching for 九星気学...");
    const results = await searchInternalKnowledge("九星気学");
    console.log(results);
  } catch (error) {
    console.error("Full Error:", error);
  }
}
test();
