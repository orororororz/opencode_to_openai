import worker from "../src/worker.mjs";

export default worker.fetch;

export const config = {
  runtime: "edge", 
  // Vercel Edge Network Regions
  // https://vercel.com/docs/edge-network/regions#region-list
  regions: [
    "arn1",
    "bom1",
    "cdg1",
    "cle1",
    "cpt1",
    "dub1",
    "fra1",
    "gru1",
    "hkg1",
    "hnd1",
    "iad1",
    "icn1",
    "kix1",
    "pdx1",
    "sfo1",
    "sin1",
    "syd1",
  ],
};
