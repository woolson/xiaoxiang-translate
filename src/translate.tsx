import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  Keyboard,
  List,
  Toast,
  environment,
  showToast,
  type LaunchProps,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { join } from "node:path";
import {
  dictionaryUrl,
  lookup,
  normalizeQuery,
  type DictionaryResult,
} from "./lib/dictionary";
import { PronunciationPlayer } from "./lib/pronunciation";

function markdownText(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#])/g, "\\$1");
}

export default function Command(
  props: LaunchProps<{ arguments: { query?: string } }>,
) {
  const [searchText, setSearchText] = useState(props.arguments.query ?? "");
  const [result, setResult] = useState<DictionaryResult>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const player = useRef(new PronunciationPlayer());

  useEffect(() => () => player.current.stop(), []);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    player.current.stop();
    let query: string;
    try {
      query = normalizeQuery(searchText);
    } catch (error) {
      setError((error as Error).message);
      setIsLoading(false);
      return;
    }
    setIsLoading(Boolean(query));
    if (!query) return;
    const timer = setTimeout(() => {
      lookup(query, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setResult(data);
        })
        .catch((error: Error) => {
          if (controller.signal.aborted) return;
          setError(
            error.name === "TimeoutError"
              ? "翻译服务响应超时，请重试"
              : error.message || "查询失败，请检查网络后重试",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, revision]);

  async function speak(word: string, accent: "uk" | "us") {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: accent === "uk" ? "播放英式发音" : "播放美式发音",
    });
    try {
      await player.current.play(
        word,
        accent,
        join(environment.supportPath, "cache"),
      );
      await toast.hide();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        await toast.hide();
        return;
      }
      toast.style = Toast.Style.Failure;
      toast.title = "发音播放失败";
      toast.message =
        error instanceof Error && error.name === "TimeoutError"
          ? "音频下载超时，请重试"
          : String(error instanceof Error ? error.message : error);
    }
  }

  async function readClipboard() {
    const text = await Clipboard.readText();
    if (!text?.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "剪贴板中没有文字",
      });
      return;
    }
    setSearchText(text);
  }

  const commonActions = (
    <ActionPanel.Section>
      <Action
        title="翻译剪贴板文字"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
        onAction={readClipboard}
      />
      <Action
        title="重新查询"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={() => setRevision((value) => value + 1)}
      />
    </ActionPanel.Section>
  );

  function actions(content: string, word: string) {
    return (
      <ActionPanel>
        <ActionPanel.Section>
          <Action.CopyToClipboard title="复制" content={content} />
          <Action
            title="美式发音"
            icon={Icon.SpeakerHigh}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={() => speak(word, "us")}
          />
          <Action
            title="英式发音"
            icon={Icon.SpeakerHigh}
            shortcut={{ modifiers: ["opt"], key: "return" }}
            onAction={() => speak(word, "uk")}
          />
          <Action.Paste
            title="粘贴到当前应用"
            content={content}
            shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
          />
          <Action.OpenInBrowser
            title="查看详细释义"
            url={dictionaryUrl(result?.query ?? searchText.trim())}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
        </ActionPanel.Section>
        {commonActions}
      </ActionPanel>
    );
  }

  const hasResults = Boolean(result?.entries.length);
  const markdown = result
    ? `# ${markdownText(result.query)}\n\n${markdownText(result.phonetic)}\n\n${result.entries.map((entry) => `- ${markdownText(entry.text)}`).join("\n\n")}\n\n---\n\n↵ 复制 · ⌥↵ 英式发音 · ⌘↵ 美式发音`
    : "";

  return (
    <List
      navigationTitle="小象翻译"
      searchBarPlaceholder="输入中文、英文单词或短语…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
      isShowingDetail={hasResults}
    >
      {!hasResults ? (
        <List.EmptyView
          icon={error ? Icon.ExclamationMark : "xiaoxiang-icon.png"}
          title={
            error
              ? "查询失败"
              : isLoading
                ? "正在查询…"
                : searchText.trim()
                  ? "没有找到词典释义"
                  : "小象翻译"
          }
          description={
            error ||
            (searchText.trim()
              ? "试试其他单词或短语，或查看详细释义。"
              : "输入即查，回车复制，⌥↵ 英音，⌘↵ 美音。")
          }
          actions={
            <ActionPanel>
              {searchText.trim() && (
                <Action.OpenInBrowser
                  title="查看详细释义"
                  url={dictionaryUrl(searchText.trim())}
                />
              )}
              {commonActions}
            </ActionPanel>
          }
        />
      ) : (
        <>
          <List.Section title="读音">
            <List.Item
              title={result!.query}
              subtitle={result!.phonetic || "按 ⌥↵ / ⌘↵ 播放发音"}
              icon={Icon.Waveform}
              detail={<List.Item.Detail markdown={markdown} />}
              actions={actions(
                result!.phoneticCopy,
                result!.entries[0]?.pronunciation ?? result!.query,
              )}
            />
          </List.Section>
          <List.Section title="释义" subtitle={`${result!.entries.length} 项`}>
            {result!.entries.map((entry, index) => (
              <List.Item
                key={`${index}:${entry.text}`}
                title={entry.text}
                icon={Icon.Text}
                detail={
                  <List.Item.Detail
                    markdown={`${markdown}${entry.subtitle ? `\n\n${markdownText(entry.subtitle)}` : ""}`}
                  />
                }
                actions={actions(entry.text, entry.pronunciation)}
              />
            ))}
          </List.Section>
        </>
      )}
    </List>
  );
}
