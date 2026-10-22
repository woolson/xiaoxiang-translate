import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { pronunciationUrl } from "./dictionary";

export async function downloadPronunciation(
  word: string,
  accent: "uk" | "us",
  signal?: AbortSignal,
): Promise<Buffer> {
  const response = await fetch(pronunciationUrl(word, accent), {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
      : AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`发音下载失败（HTTP ${response.status}）`);
  if (!/audio\//i.test(response.headers.get("content-type") ?? ""))
    throw new Error("发音服务没有返回有效音频");
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 100 || audio.length > 5_000_000)
    throw new Error("发音文件大小异常");
  return audio;
}

export class PronunciationPlayer {
  private controller?: AbortController;
  private process?: ChildProcess;

  stop() {
    this.controller?.abort();
    this.process?.kill();
    this.process = undefined;
  }

  async play(
    word: string,
    accent: "uk" | "us",
    cacheDirectory: string,
  ): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    const directory = join(cacheDirectory, "pronunciations");
    const filename = `${createHash("sha256").update(`${accent}:${word}`).digest("hex")}.mp3`;
    const path = join(directory, filename);
    await mkdir(directory, { recursive: true });
    try {
      await readFile(path);
    } catch {
      const audio = await downloadPronunciation(
        word,
        accent,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      await writeFile(path, audio);
    }
    controller.signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const child = spawn("/usr/bin/afplay", [path]);
      this.process = child;
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (this.process === child) this.process = undefined;
        if (signal || controller.signal.aborted)
          reject(new DOMException("播放已取消", "AbortError"));
        else if (code === 0) resolve();
        else reject(new Error("播放失败，请检查系统音频输出"));
      });
    });
    // 只清理本扩展缓存目录里超过 40 个的发音文件。
    const files = await readdir(directory);
    if (files.length > 40) {
      const dated = await Promise.all(
        files.map(async (file) => ({
          file,
          time: (await stat(join(directory, file))).mtimeMs,
        })),
      );
      for (const { file } of dated.sort((a, b) => b.time - a.time).slice(40)) {
        await rm(join(directory, file), { force: true });
      }
    }
  }
}
