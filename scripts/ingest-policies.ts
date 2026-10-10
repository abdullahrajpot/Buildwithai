// npm run ingest: chunk, embed, and store the mock insurer policies (run once; seed also does this).
import "./env";
import { ingestPolicies } from "../lib/ingest";
import { getStore } from "../lib/db";

async function main() {
  console.log(`Ingesting policies into ${getStore().kind} store...`);
  await ingestPolicies();
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
