#!/usr/bin/env node
// The npm Foundry launcher does not propagate child exit status in version 1.7.1.
// Invoke its pinned native binary directly so a failed test reliably fails CI.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const arch = process.arch === "x64" ? "amd64" : process.arch;
const binary = process.platform === "win32" ? "forge.exe" : "forge";
let executable;
try { executable = require.resolve(`@foundry-rs/forge-${process.platform}-${arch}/bin/${binary}`); }
catch {
  process.stderr.write("Foundry binary is unavailable for this platform; run npm ci with optional dependencies.\n");
  process.exit(1);
}
const result = spawnSync(executable, process.argv.slice(2), {
  cwd: path.resolve(__dirname, ".."), stdio: "inherit",
});
if (result.error) process.stderr.write("Unable to execute Foundry binary\n");
process.exit(result.status ?? 1);
