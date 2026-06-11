const { Client } = require("pg");
const regions = [
  "ap-northeast-1", // Tokyo
  "ap-northeast-2", // Seoul
  "ap-northeast-3", // Osaka
  "ap-southeast-1", // Singapore
  "ap-southeast-2", // Sydney
  "ap-south-1", // Mumbai
  "us-east-1", // N. Virginia
  "us-east-2", // Ohio
  "us-west-1", // N. California
  "us-west-2", // Oregon
  "eu-central-1", // Frankfurt
  "eu-west-1", // Ireland
  "eu-west-2", // London
  "eu-west-3", // Paris
  "eu-north-1", // Stockholm
  "sa-east-1", // Sao Paulo
  "ca-central-1", // Canada Central
];

async function test() {
  for (const r of regions) {
    const url = `postgresql://postgres.ymqiqscelqqkozqwoiko:fY9v%2FN%2Frs%2F.AbL%23@aws-0-${r}.pooler.supabase.com:6543/postgres`;
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      console.log("SUCCESS: " + r);
      await client.end();
      process.exit(0);
    } catch (e) {
      console.log("FAILED: " + r + " - " + e.message);
    }
  }
}
test();
