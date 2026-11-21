const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const manifest = require("../Client/assets.json");
async function build(output = path.join(root, ".build/client")) {
  output = path.resolve(output);
  await fs.mkdir(output, { recursive: true });
  for (const [url, file] of Object.entries(manifest)) {
    if (url === "/") continue;
    const source = path.resolve(root, file),
      destination = path.resolve(output, "." + url);
    if (
      !source.startsWith(root + path.sep) ||
      !destination.startsWith(output + path.sep)
    )
      throw new Error("Asset path escapes the build directory.");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  console.log("Client assets prepared.");
}
if (require.main === module)
  build(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { build };
