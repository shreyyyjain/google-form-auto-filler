const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

// Ensure dist directory exists
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy manifest and public files
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, distDir, { recursive: true, force: true });
}

const buildConfig = {
  entryPoints: {
    "content-script": "src/content-scripts/injector.ts",
  },
  bundle: true,
  minify: true,
  sourcemap: true,
  target: "ES2020",
  outdir: "dist",
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
  loader: {
    ".png": "dataurl",
  },
};

async function build() {
  try {
    if (isWatch) {
      const context = await esbuild.context(buildConfig);
      console.log("🔍 Watching for changes...");
      await context.watch();
    } else {
      const result = await esbuild.build(buildConfig);
      console.log("✅ Build successful!");
      console.log(`📦 Output: ${result.outputFiles?.length || 0} files`);
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

build();
