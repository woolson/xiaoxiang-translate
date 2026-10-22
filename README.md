# 小象翻译 · Raycast 扩展

## 下载与安装

[GitHub Releases](https://github.com/woolson/xiaoxiang-translate/releases) 提供源码包和 `.rayext` 预构建归档。

**安装限制：`.rayext` 是构建归档，当前并非普通版 Raycast 可直接双击安装的安装包。** 已检查的 macOS Raycast 2.8.2 会拒绝导入该文件，提示 `Extension bundles are only available in internal builds`。官方 CLI 能生成此归档，并不代表当前普通版客户端支持安装。归档供分发、检查及后续兼容使用，目前请按下文通过源码安装。

```sh
git clone https://github.com/woolson/xiaoxiang-translate.git
cd xiaoxiang-translate
npm ci
npm run dev
```

看到构建成功后，按 Ctrl+C 结束开发进程，命令会保留在 Raycast 中。

## 使用

在 Raycast 搜索 **小象翻译**，回车后输入中文、英文单词或短语。也可以在命令的可选参数里直接输入。

![小象翻译 Logo](assets/xiaoxiang-icon.png)

| 操作                                          | 快捷键 |
| --------------------------------------------- | ------ |
| 复制当前释义（读音行复制英文原词 / 中文拼音） | ↵      |
| 英式发音                                      | ⌥↵     |
| 美式发音                                      | ⌘↵     |
| 粘贴到当前应用                                | ⌘⇧↵    |
| 查看详细释义                                  | ⌘O     |
| 翻译剪贴板文字                                | ⌘⇧V    |
| 重新查询                                      | ⌘R     |

动作也可以通过 ⌘K 打开。输入中文时，在英文释义上播放对应英文发音。

可在 Raycast Settings → 小象翻译 → 小象翻译 的命令设置里，将 Alias 设为 `xx`。别名是 Raycast 的本机设置，不属于扩展清单。

## 本地安装与开发

需要 macOS、Raycast 和 Node.js ≥ 22.22.2。

```sh
npm install
npm run build
npm run bundle
```

`npm run build` 将生产构建写入 `dist/`。`npm run bundle` 将生产构建打包为根目录的 `xiaoxiang-translate.rayext`；也可通过 `npm run bundle -- --output /path/to/file.rayext` 指定输出位置。

打包脚本调用官方 `ray bundle`，并将归档 source map 中的本机源码位置整理为相对路径；打包环境需要 macOS 自带的 `zip` 和 `unzip`。

`npm run dev` 会将源码扩展导入本地 Raycast。以后修改代码需要重新运行该命令。无需发布到商店。扩展源码目录请保留。

```sh
npm run typecheck
npm run lint
npm test
npm run test:live
```

最后一项会实际查询公开测试词，并下载两种口音的音频进行检查，不会播放音频。

## 实现与数据来源

- 采用 Raycast 原生 List、详情及 ActionPanel，支持中英释义、音标、拼音、复制、英式与美式发音。
- 查询使用有道官网数据接口 `https://dict.youdao.com/jsonapi`，发音使用 `dictvoice` 服务。查询词会发送给该服务；无额外统计服务，不保存查询历史。
- 查询有 300ms 防抖、12 秒超时和取消机制，避免快速输入时旧结果覆盖新结果。
- 发音通过 macOS 自带 `afplay` 播放，以参数数组调用，不拼接 shell 命令；缓存限制为 40 个音频文件。音频存放在 Raycast 为此扩展提供的缓存目录。
- 不需要 App Key、App Secret、Raycast Pro 或 Alfred。不自动读取剪贴板；只有触发“翻译剪贴板文字”时才读取。
- 支持中英单词与短语翻译，不保证任意整段文本翻译；没有释义时提供网页入口。数据接口未承诺第三方兼容性，服务变更可能需要调整解析。
- 发布版本的扩展标识为 `xiaoxiang-translate`，界面名称为“小象翻译”。

## Logo

绿色小象头像与对话气泡耳朵，采用翡翠绿、薄荷绿和透明背景。由内置图像模型生成，Raycast 图标为 512×512 PNG。生成方式和完整提示词见 [LOGO.md](LOGO.md)。

## 来源和许可

基于 [woolson/alfred-workflow-youdao](https://github.com/woolson/alfred-workflow-youdao) 迁移，参考提交 `fe7b4cfdfcc2980ebaec6644807fbd1e18d8d520`。原作者 Woolson Lee；原仓库 package.json 声明 ISC 许可。迁移代码采用 ISC 许可，见 LICENSE。Logo 为本次重新生成的品牌素材。
