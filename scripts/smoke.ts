import assert from "node:assert/strict";
import { lookup } from "../src/lib/dictionary";
import { downloadPronunciation } from "../src/lib/pronunciation";

async function main() {
  for (const query of [
    "hello",
    "你好",
    "苹果",
    "take care",
    "C++",
    "asdfghjklnotawordzz",
  ]) {
    const result = await lookup(query);
    if (query === "asdfghjklnotawordzz") assert.equal(result.entries.length, 0);
    else assert.ok(result.entries.length > 0, `${query} 应有词典释义`);
    if (query === "你好")
      assert.ok(result.entries.some((entry) => entry.text === "how do you do"));
    console.log(
      JSON.stringify({
        query,
        phonetic: result.phonetic,
        count: result.entries.length,
        first: result.entries[0]?.text,
      }),
    );
  }
  for (const accent of ["uk", "us"] as const) {
    const audio = await downloadPronunciation("hello", accent);
    console.log(
      JSON.stringify({ accent, bytes: audio.length, validAudioResponse: true }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
