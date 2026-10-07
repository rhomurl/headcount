#!/usr/bin/env node
// Foundry standard-JSON bridge for the lockfile-pinned solc-js compiler.
// Native solc is optional; this bridge keeps verification reproducible via npm ci.
const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");
if (!solc.version().startsWith("0.8.24+")) {
  process.stderr.write("Expected pinned solc 0.8.24\n");
  process.exit(1);
}
if (process.argv.includes("--version")) {
  process.stdout.write(`solc, the solidity compiler commandline interface\nVersion: ${solc.version()}\n`);
} else if (process.argv.includes("--standard-json")) {
  const input = fs.readFileSync(0, "utf8");
  const output = solc.compile(input, { import: (importPath) => {
    try { return { contents: fs.readFileSync(path.resolve(process.cwd(), importPath), "utf8") }; }
    catch { return { error: `Unable to resolve import ${importPath}` }; }
  } });
  process.stdout.write(output);
} else {
  process.stderr.write("Supported compiler modes: --version, --standard-json\n");
  process.exit(1);
}
