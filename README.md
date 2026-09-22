# Elon的工作

一个本地优先的 Chrome Manifest V3 扩展：在 X (`x.com`) 上使用用户自己的 TypeSafe Jev API Key，对高置信度的色情、性暗示和色情引流评论显示可恢复的隐藏占位符，并为疑似 SLOP 的帖子正文叠加可交互印章。

[隐私政策](privacy.html)

[Chrome Web Store 在线安装](https://chromewebstore.google.com/detail/elon%E7%9A%84%E5%B7%A5%E4%BD%9C/aillmgiicpcpnnggaahlkifchigmfome)

[English](README.en.md)

[MIT License](LICENSE)

## 本地手动编译与安装

环境要求：Node.js 20 或更高版本。

在项目根目录执行以下命令，完成测试、检查并生成 Chrome 扩展产物：

```bash
npm test
npm run check
npm run package
npm run benchmark
```

编译完成后，打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择项目下生成的 `dist/` 目录。第一次安装会自动打开 onboarding。

## 效果预览

<p align="center">
  <img src="docs/screenshots/comment-filtering.png" alt="X 评论区过滤效果" width="720">
</p>

命中的评论会被替换为可恢复的隐藏占位符；设置中心默认将每日 TypeSafe 请求上限设为 100,000，并提供缓存、并发和成本保护。

设置中心将配置拆成两层：识别规范分别管理帖子正文 SLOP 与评论内容的模型判断说明；过滤规范分别管理帖子盖章/蒙层、SLOP 阈值，以及评论规则的启用状态、隐藏阈值和 Fail-Open 行为。自定义评论识别规则也可以单独添加和修改。

帖子正文还会单独进行 SLOP 检测：命中低信息密度、模板化或明显生成式内容时，只叠加动画 `SLOP` 印章，不修改原文；鼠标移入帖子后印章会弱化。SLOP 判定与评论隐藏规则分开，并使用同一个 TypeSafe API Key。

<p align="center">
  <img src="docs/screenshots/custom-rule-editor.png" alt="自定义评论过滤规则编辑器" width="720">
</p>

## 安全边界

- API Key 只由 service worker 读取，存于 `chrome.storage.local`；popup、设置页只通过消息协议保存/测试。
- content script 只向 service worker 发送 `{ tweetId, text }`，其中 `text` 是待检查的帖子或评论正文（评论检查时会合并用户名）；不读取 cookie、history 或 X 登录信息。
- TypeSafe 请求使用 `https://api.typesafe.ai/v1/systemone`；API 返回不符合预期、超时、401、429 或 5xx 时 Fail Open。
- 缓存只使用帖子/评论内容、规则 fingerprint 和 model 的 hash 作为 key，不保存帖子或评论原文。
- `manifest.json` 未申请 `tabs`、`history`、`cookies`、`webRequest` 或 `<all_urls>`。

## 测试覆盖

`tests/` 覆盖默认规则、规则编译、文本 normalize、Root Tweet/详情页范围、SHA-256 cache key、阈值决策、API 响应解析、存储脱敏和 Fail-Open 错误分类。实际 TypeSafe 调用需要用户自己的 API Key，因此自动化测试使用确定性 mock，不会产生 API 成本。

本地语料库位于 `tests/fixtures/comment-corpus.json`，包含正常评论、医学/教育、普通恋爱、外貌评价、隐晦性暗示、私密内容、联系方式、emoji、长数字 ID、用户名色情/招揽信号，以及“搞hs / 小马开大车”和截图标注的 `emoji spam` 样本。`emoji spam` 样本额外记录 `spam: true`，由启用的 `spam_behavior` 规则单独评估；该规则同时使用 TypeSafe 分数和页面内去 emoji 后的重复模板信号，命中后会进入最终隐藏决策。当前 `npm run benchmark` 会将这些样本从色情规则指标中排除，但会单独输出 `spam-samples` 的 Precision/Recall/F1，不会把它们当作成功样本。配置 `.env` 中的 `TYPESAFE_API_KEY` 后运行 benchmark，脚本只输出 Precision、Recall、F1、误报/漏报 ID 和延迟，不输出 API Key；可用 `--limit=10` 做小样本检查，或 `--json` 输出不含原文的机器可读结果。

也可以按语料 ID 精确回归：`bun run benchmark -- --id=hide-040`。单条 ID 会输出详细评估，包括用户名、正文、emoji 结构信号、默认规则概率/阈值/命中状态、最终判定和实际发送内容；多个 ID 使用逗号分隔：`bun run benchmark -- --ids=hide-040,hide-041`。
