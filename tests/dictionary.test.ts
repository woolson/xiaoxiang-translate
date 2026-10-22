import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  dictionaryUrl,
  lookup,
  normalizeQuery,
  parseDictionary,
  pronunciationUrl,
} from "../src/lib/dictionary";
import { downloadPronunciation } from "../src/lib/pronunciation";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8"));
}

test("真实英文字典数据保留多个释义、英美音标和词义中的非 HTML 标记", () => {
  const result = parseDictionary(fixture("english"), "hello");
  assert.equal(result.entries.length, 3);
  assert.match(result.phonetic, /英 \/həˈləʊ\/.*美 \/həˈloʊ\//);
  assert.match(result.entries[0].text, /<非正式>/);
  assert.equal(result.phoneticCopy, "hello");
  assert.equal(result.entries[0].pronunciation, "hello");
});

test("真实中文字典数据保留拼音与拆分节点之间的短语空格", () => {
  const result = parseDictionary(fixture("chinese"), "你好");
  assert.equal(result.phonetic, "拼音：nǐ hǎo");
  assert.equal(result.phoneticCopy, "nǐ hǎo");
  assert.deepEqual(
    result.entries.map((entry) => entry.text),
    ["hello", "hi", "how do you do"],
  );
  assert.equal(result.entries[2].pronunciation, "how do you do");
});

test("没有词条、空输入、错误的数据格式均可处理", async () => {
  assert.deepEqual(
    parseDictionary({ input: "unknown", meta: {} }, "unknown").entries,
    [],
  );
  assert.deepEqual((await lookup("  ")).entries, []);
  assert.throws(() => parseDictionary(null, "hello"), /无法识别/);
  assert.throws(() => parseDictionary([], "hello"), /无法识别/);
  assert.equal(normalizeQuery("  how\n do\t you do  "), "how do you do");
  assert.throws(() => normalizeQuery("a".repeat(501)), /500/);
});

test("特殊字符不会改变查词和发音 URL 参数或口音", () => {
  const word = "C++ & hello? /中文 # ' $()";
  const uk = new URL(pronunciationUrl(word, "uk"));
  const us = new URL(pronunciationUrl(word, "us"));
  assert.equal(uk.searchParams.get("audio"), word);
  assert.equal(uk.searchParams.get("type"), "1");
  assert.equal(us.searchParams.get("type"), "2");
  assert.equal(
    decodeURIComponent(new URL(dictionaryUrl(word)).pathname),
    `/w/${word}/`,
  );
});

test("查询准确编码参数，并明确报告 HTTP 错误和非 JSON 响应", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (input: URL) => {
    assert.equal(input.searchParams.get("q"), "hello & 你好");
    return new Response(JSON.stringify({}), { status: 200 });
  });
  await lookup(" hello & 你好 ");
  mock.mock.mockImplementation(
    async () => new Response("unavailable", { status: 503 }),
  );
  await assert.rejects(lookup("hello"), /HTTP 503/);
  mock.mock.mockImplementation(
    async () => new Response("<html>blocked</html>"),
  );
  await assert.rejects(lookup("hello"), /不是词典数据/);
});

test("已取消的请求不继续发送", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      (init?.signal as AbortSignal).throwIfAborted();
      return new Response("{}");
    },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookup("hello", controller.signal), {
    name: "AbortError",
  });
});

test("拒绝伪装成发音的错误网页、空音频和 HTTP 错误", async (t) => {
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>error</html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  await assert.rejects(downloadPronunciation("hello", "uk"), /有效音频/);
  mock.mock.mockImplementation(
    async () => new Response("", { headers: { "content-type": "audio/mpeg" } }),
  );
  await assert.rejects(downloadPronunciation("hello", "uk"), /大小异常/);
  mock.mock.mockImplementation(
    async () => new Response("error", { status: 429 }),
  );
  await assert.rejects(downloadPronunciation("hello", "us"), /HTTP 429/);
});
