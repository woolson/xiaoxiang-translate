export interface DictionaryEntry {
  text: string;
  subtitle?: string;
  pronunciation: string;
}

export interface DictionaryResult {
  query: string;
  phonetic: string;
  phoneticCopy: string;
  entries: DictionaryEntry[];
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// 有道中文词条将一个英文短语拆成多个 #text 节点，空格也在 i 数组里。
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join("");
  return typeof object(value)["#text"] === "string"
    ? (object(value)["#text"] as string)
    : "";
}

function clean(value: unknown): string {
  return text(value)
    .replace(/<\/?(?:b|i|em|strong|span)(?:\s[^>]*)?>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) => {
      return (
        {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          nbsp: " ",
        } as Record<string, string>
      )[entity];
    })
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeQuery(query: string): string {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (normalized.length > 500) throw new Error("请输入 500 字以内的单词或短语");
  return normalized;
}

export function dictionaryUrl(query: string): string {
  return `https://dict.youdao.com/w/${encodeURIComponent(query)}/`;
}

export function pronunciationUrl(word: string, accent: "uk" | "us"): string {
  const url = new URL("https://dict.youdao.com/dictvoice");
  url.searchParams.set("audio", word);
  url.searchParams.set("type", accent === "uk" ? "1" : "2");
  return url.toString();
}

export function parseDictionary(
  data: unknown,
  query: string,
): DictionaryResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("翻译服务返回了无法识别的数据，请稍后重试");
  }
  const root = object(data);
  const english = array(object(root.ec).word).map(object);
  const chinese = array(object(root.ce).word).map(object);
  const simple = object(array(object(root.simple).word)[0]);
  const first = english[0] ?? chinese[0] ?? simple;
  const uk = clean(first.ukphone ?? simple.ukphone);
  const us = clean(first.usphone ?? simple.usphone);
  const phone = clean(first.phone ?? simple.phone);
  const phonetic =
    [uk && `英 /${uk}/`, us && `美 /${us}/`].filter(Boolean).join("   ") ||
    (phone ? `拼音：${phone}` : "");
  const result: DictionaryResult = {
    query,
    phonetic,
    phoneticCopy: english.length ? query : phone || query,
    entries: [],
  };
  const seen = new Set<string>();
  for (const word of english.length ? english : chinese) {
    for (const group of array(word.trs).map(object)) {
      for (const translation of array(group.tr).map(object)) {
        const line = object(translation.l);
        const parts = english.length
          ? (Array.isArray(line.i) ? line.i : [line.i]).map(clean)
          : clean(line.i).split(/[;；]/);
        for (const part of parts) {
          const value = part.trim();
          if (!value || seen.has(value)) continue;
          seen.add(value);
          result.entries.push({
            text: value,
            subtitle: english.length
              ? undefined
              : clean(group.pos ?? word.pos) || clean(line["#tran"]),
            pronunciation: english.length ? query : value,
          });
        }
      }
    }
  }
  return result;
}

export async function lookup(
  query: string,
  signal?: AbortSignal,
): Promise<DictionaryResult> {
  const normalized = normalizeQuery(query);
  if (!normalized)
    return { query: "", phonetic: "", phoneticCopy: "", entries: [] };
  const url = new URL("https://dict.youdao.com/jsonapi");
  url.searchParams.set("q", normalized);
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
      : AbortSignal.timeout(12_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`翻译查询失败（HTTP ${response.status}），请稍后重试`);
  try {
    return parseDictionary(await response.json(), normalized);
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("翻译服务返回的内容不是词典数据，请稍后重试");
    throw error;
  }
}
