import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A lockfile in a parent folder would otherwise make Next guess the wrong workspace root.
  outputFileTracingRoot: process.cwd(),
  // transformers.js (bge-small embeddings) and the Mongo driver must stay on the Node runtime,
  // outside the server bundle. Never move these routes to the Edge runtime.
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp", "mongodb", "unpdf", "pdf-lib"],
};

export default nextConfig;
