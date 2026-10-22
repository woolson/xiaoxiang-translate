import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (
  args.length !== 0 &&
  !(args.length === 2 && ["--output", "-o"].includes(args[0]))
) {
  throw new Error("用法：npm run bundle [-- --output /path/to/file.rayext]");
}
const output = resolve(root, args[1] ?? "xiaoxiang-translate.rayext");

execFileSync(
  join(root, "node_modules", ".bin", "ray"),
  ["bundle", "--output", output],
  {
    cwd: root,
    stdio: "inherit",
  },
);

// 官方 CLI 在临时目录构建时，会把本机源码绝对位置写入 source map。
// 保留调试数据，只将本项目源码路径规范为归档内的相对路径。
const temporary = mkdtempSync(join(tmpdir(), "xiaoxiang-bundle-"));
const build = join(temporary, "build");
try {
  execFileSync("unzip", ["-q", output, "-d", build]);
  for (const file of readdirSync(build).filter((name) =>
    name.endsWith(".js.map"),
  )) {
    const path = join(build, file);
    const map = JSON.parse(readFileSync(path, "utf8"));
    map.sources = map.sources.map((source) => {
      const marker = source.lastIndexOf("/src/");
      return marker >= 0 ? source.slice(marker + 1) : source;
    });
    map.sourceRoot = "";
    writeFileSync(path, JSON.stringify(map));
  }
  const archive = join(temporary, "release.rayext");
  execFileSync("zip", ["-q", "-r", archive, "."], { cwd: build });
  copyFileSync(archive, output);
  console.log(`ready  - prepared release archive: ${output}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
