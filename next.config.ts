import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ali-oss 是 CommonJS 且依赖 Node 内置模块，需作为服务端外部包不被打包
  // 仅在 Node.js Runtime 的 Route Handler / Worker 中使用，不进入浏览器 bundle
  serverExternalPackages: ["ali-oss"],
};

export default nextConfig;
