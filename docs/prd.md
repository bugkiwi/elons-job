# Elon的工作

> Chrome Extension 产品需求与技术设计  
> 版本：MVP v0.1  
> 平台：Chrome / Chromium，Manifest V3  
> 目标站点：X（x.com）  
> 判别服务：TypeSafe Jev

---

## 1. 产品定义

### 1.1 一句话描述

**“Elon的工作”是一个只针对 X 评论区的 Chrome 插件：自动识别色情、性暗示、擦边和色情引流评论，并将高置信度命中的评论隐藏。**

用户使用自己的 TypeSafe API Key，默认提供少量过滤规则，也可以自行新增、修改和关闭规则。

### 1.2 核心原则

1. **只处理 X 评论区**
2. **不修改 X 原始数据，只改变本地显示**
3. **高置信度才自动隐藏**
4. **所有隐藏评论都可以手动恢复**
5. **用户拥有规则控制权**
6. **TypeSafe API Key 由用户自己提供**
7. **API 异常时 Fail Open：不隐藏评论**
8. **MVP 只分析文本，不分析图片和视频**

### 1.3 MVP 不做

- X 首页推荐流过滤
- 私信过滤
- 图片 / 视频色情识别
- OCR
- 头像识别
- 账号级风险评分
- 自建后端账号系统
- 云端同步
- 插件开发者代付 TypeSafe API 成本
- 自动 Block / Report X 用户

---

# 2. 用户场景

典型评论：

```text
CM比我👆好看的没我骚🖤❤️比我骚的没我好看1789699386154
```

这类内容未必属于“露骨色情”，但可能同时具备：

- 性暗示
- 擦边表达
- 自我性化
- 色情招揽
- 长数字联系方式 / ID
- 引导进一步联系

因此插件不应该只判断：

```text
is_explicit_sexual
```

而应该围绕最终业务动作：

> **这条评论是否属于用户不想看到的色情 / 性暗示 / 色情引流内容？**

---

# 3. 首次安装流程

首次安装后自动打开 Onboarding 页面。

```text
安装插件
  ↓
输入 TypeSafe API Key
  ↓
测试连接
  ↓
确认默认过滤规则
  ↓
可选：新增自定义规则
  ↓
完成
```

## 3.1 API Key 面板

```text
连接 TypeSafe

TypeSafe API Key
[ ******************************** ]

[测试连接]

API Key 仅保存在你的浏览器中，
并用于直接请求 TypeSafe API。
```

要求：

- 提供 `测试连接`
- 明确连接成功 / 失败
- 支持修改和删除 API Key
- API Key 不写入日志
- API Key 不进入 X 页面 DOM
- API Key 不发送给插件开发者服务器

---

# 4. 默认过滤规则

为了让用户理解简单，MVP 默认只暴露两个规则。

---

## 4.1 色情 / 性暗示

### 用户可见描述

```text
色情 / 性暗示

隐藏包含色情、明显性暗示、性挑逗、
擦边或自我性化表达的评论。

普通恋爱、医学、教育、新闻讨论不算。
```

### Jev Question

```json
{
  "sexual_content": {
    "type": "noul",
    "instructions": "判断 `content` 是否属于色情、情色、明显性暗示、性挑逗、擦边或自我性化内容。根据整句话的语义和意图判断，不要求出现明确色情关键词。",
    "criteria": {
      "true": "内容以性、情色、性吸引力、性挑逗、性暗示、擦边或自我性化表达为核心。",
      "false": "普通聊天、正常恋爱、普通外貌评价、医学教育、新闻讨论，或虽然出现可能具有性含义的词但上下文没有明显性意味。"
    }
  }
}
```

---

## 4.2 色情引流 / 招揽

### 用户可见描述

```text
色情引流 / 招揽

隐藏通过色情或性暗示吸引别人私聊、
添加账号、点击链接、联系或购买服务的评论。
```

### Jev Question

```json
{
  "sexual_solicitation": {
    "type": "noul",
    "instructions": "判断 `content` 是否通过色情、情色或明显性暗示进行招揽、色情引流或诱导进一步联系。",
    "criteria": {
      "true": "通过性化内容吸引用户私聊、添加联系方式、关注账号、点击链接、约会、购买色情相关服务或进行其他进一步互动。",
      "false": "没有通过性化内容进行招揽或导流。"
    }
  }
}
```

---

# 5. 默认决策逻辑

```js
const shouldHide =
  sexual_content.pTrue >= sexualThreshold ||
  sexual_solicitation.pTrue >= solicitationThreshold
```

默认：

```text
sexualThreshold = 0.80
solicitationThreshold = 0.80
```

目标是优先降低误伤，而不是追求最大召回率。

推荐预设：

| 模式 | Threshold | 含义 |
|---|---:|---|
| 严格 | 0.90 | 尽量避免误伤 |
| 平衡 | 0.80 | 默认 |
| 激进 | 0.65 | 尽量多过滤 |

---

# 6. 用户自定义过滤规则

用户可以增加自然语言规则。

例如：

```text
+ 添加过滤规则
```

编辑面板：

```text
规则名称
[ Crypto spam ]

隐藏什么内容？
[ 推广加密货币、代币、空投或可疑投资机会 ]

不要隐藏什么内容？
[ 正常讨论 Bitcoin、上市公司或行业新闻 ]

敏感度
严格 ───── 平衡 ───── 激进

[取消] [保存]
```

内部转换为：

```json
{
  "custom_crypto_spam": {
    "type": "noul",
    "instructions": "判断 `content` 是否符合以下过滤条件：推广加密货币、代币、空投或可疑投资机会。",
    "criteria": {
      "true": "推广加密货币、代币、空投或可疑投资机会。",
      "false": "普通 Bitcoin、区块链、上市公司或投资相关讨论。"
    }
  }
}
```

## 6.1 Rule 数据结构

```ts
type FilterRule = {
  id: string
  name: string
  description: string
  instructions: string
  trueCriteria?: string
  falseCriteria?: string
  threshold: number
  enabled: boolean
  builtin: boolean
}
```

示例：

```json
{
  "id": "sexual_content",
  "name": "色情 / 性暗示",
  "description": "隐藏色情、明显性暗示、性挑逗或擦边内容",
  "instructions": "判断 `content` 是否属于色情、情色、明显性暗示、性挑逗、擦边或自我性化内容。",
  "trueCriteria": "内容以性、情色、性吸引力、性挑逗、性暗示、擦边或自我性化表达为核心。",
  "falseCriteria": "普通聊天、正常恋爱、医学教育或新闻讨论。",
  "threshold": 0.8,
  "enabled": true,
  "builtin": true
}
```

---

# 7. Popup

点击扩展图标：

```text
Elon的工作

保护状态        ● ON

当前页面
已检查  23
已隐藏   7

过滤规则
✓ 色情 / 性暗示
✓ 色情引流 / 招揽
✓ Crypto spam

[设置]
```

没有配置 API Key：

```text
尚未连接 TypeSafe

[连接 TypeSafe]
```

---

# 8. Settings

```text
Elon的工作

General
  启用保护                      ON
  只处理评论                    ON

TypeSafe
  API Key                       ••••••••••••••••
  状态                          Connected
  [测试] [更换] [删除]

Filters
  ✓ 色情 / 性暗示              80%
  ✓ 色情引流 / 招揽            80%
  ✓ Crypto spam                85%

  [+ 添加规则]

Display
  显示隐藏占位符                ON
  显示置信度                    ON

Advanced
  最大并发请求                  3
  Cache                         24h
  Debug Mode                    OFF
```

---

# 9. Rule Editor

默认只展示简单表单。

```text
规则名称
[ 色情 / 性暗示 ]

隐藏什么内容？
[ __________________________________ ]

不要隐藏什么内容？
[ __________________________________ ]

敏感度
严格 ───── 平衡 ───── 激进

[取消] [保存]
```

高级模式：

```text
Advanced

Jev instructions
True criteria
False criteria
Numeric threshold
```

---

# 10. X 页面处理范围

## 10.1 MVP 只处理 Tweet Detail

启用：

```text
https://x.com/{user}/status/{tweetId}
```

暂不处理：

```text
/home
/explore
/search
/notifications
/messages
```

这样可以避免第一版误处理主 Timeline。

## 10.2 Root Tweet 不过滤

当前 URL：

```text
/status/123456789
```

其中 `123456789` 是 Root Tweet ID。

页面中：

```text
article[data-testid="tweet"]
```

如果 Tweet ID 等于 Root Tweet ID：

```js
tweetId === rootTweetId
```

则跳过。

其他 Tweet 节点作为 reply 候选。

---

# 11. X DOM Adapter

X 的 DOM 可能变化，所以 selector 必须集中管理。

```text
content/
  x-adapter.js
```

例如：

```js
const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]'
}
```

不要把 X selector 散落在业务逻辑中。

---

# 12. 评论提取

提取：

```js
{
  tweetId,
  text
}
```

发给 TypeSafe 的 state 只包含：

```json
{
  "content": "评论文本"
}
```

默认不发送：

- X 用户名
- X User ID
- Cookie
- X 登录 Token
- 浏览历史
- Root Tweet 内容
- 其他评论
- 用户头像

---

# 13. DOM 动态监听

X 是 React SPA，必须使用 `MutationObserver`。

```text
MutationObserver
      ↓
发现新的 Tweet
      ↓
判断是不是 Reply
      ↓
判断是否处理过
      ↓
提取文本
      ↓
放入 Classification Queue
```

伪代码：

```js
const observer = new MutationObserver(() => {
  for (const comment of findUnprocessedReplies()) {
    queue.enqueue(comment)
  }
})
```

DOM 状态可标记：

```html
data-elon-work-state="pending"
data-elon-work-state="safe"
data-elon-work-state="hidden"
```

但不能只依赖 DOM Attribute 去重，因为 X 会动态重建节点。

应额外使用：

```text
tweetId
+
contentHash
```

去重。

---

# 14. Classification Pipeline

```text
X DOM
 │
 ▼
X Adapter
 │
 ▼
Reply Extractor
 │
 ▼
Normalize Text
 │
 ▼
Cache Lookup
 │
 ├─ HIT ─────────► Apply Result
 │
 ▼
Request Queue
 │
 ▼
Extension Service Worker
 │
 ▼
TypeSafe Jev
 │
 ▼
Probability Results
 │
 ▼
Rule Engine
 │
 ▼
Hide / Keep
```

---

# 15. 文本 Normalize

可以：

- trim
- 合并连续空白
- 去除零宽字符

必须保留：

- emoji
- 数字
- URL
- 特殊符号
- 重复字符

例如：

```text
骚🖤❤️1789699386154
```

其中 emoji 和长数字本身就是潜在语义信号。

不要预先清洗掉。

---

# 16. Jev 请求生成

假设用户启用：

```text
✓ 色情 / 性暗示
✓ 色情引流 / 招揽
✓ Crypto spam
```

动态组合：

```json
{
  "questions": {
    "sexual_content": {
      "type": "noul",
      "instructions": "...",
      "criteria": {
        "true": "...",
        "false": "..."
      }
    },
    "sexual_solicitation": {
      "type": "noul",
      "instructions": "...",
      "criteria": {
        "true": "...",
        "false": "..."
      }
    },
    "custom_crypto_spam": {
      "type": "noul",
      "instructions": "...",
      "criteria": {
        "true": "...",
        "false": "..."
      }
    }
  },
  "state": {
    "content": "..."
  }
}
```

本地规则：

```js
const matchedRules = enabledRules.filter(rule =>
  result[rule.id]?.pTrue >= rule.threshold
)

const shouldHide = matchedRules.length > 0
```

Jev 负责：

```text
判断概率
```

插件负责：

```text
业务决策
```

不要让模型直接输出：

```text
hide / show
```

---

# 17. API 调用位置

不要在 X 页面 Context 中直接调用 TypeSafe。

推荐：

```text
Content Script
      │
      │ chrome.runtime.sendMessage
      ▼
Service Worker
      │
      │ HTTPS
      ▼
TypeSafe API
```

优势：

- API Key 不暴露给 X 页面脚本
- 网络请求集中管理
- 易于实现 Queue
- 易于实现 retry
- 易于实现 rate limit
- 易于实现 cache

---

# 18. API Key 存储

MVP 使用：

```js
chrome.storage.local
```

例如：

```json
{
  "typesafeApiKey": "..."
}
```

要求：

1. 不写日志
2. 不写 DOM
3. 不写 URL query string
4. 不进入 analytics
5. Service Worker 才读取
6. 仅发送到 TypeSafe API
7. UI 中只显示 mask
8. 支持删除 / 替换

UI 文案应写：

```text
Stored locally in your browser.
```

不要承诺：

```text
Absolutely secure / encrypted.
```

---

# 19. TypeSafe Client

封装：

```text
background/typesafe-client.js
```

接口：

```js
class TypeSafeClient {
  async testConnection(apiKey) {}

  async classify({
    apiKey,
    questions,
    state
  }) {}
}
```

TypeSafe API 的：

- endpoint
- authorization header
- request schema
- response schema
- rate limit
- timeout

必须以实际官方 API 文档为准，不在需求阶段硬编码未经确认的格式。

---

# 20. Request Queue

用户快速滚动可能瞬间产生大量评论。

默认：

```text
maxConcurrency = 3
```

流程：

```text
Pending
   ↓
Concurrency Limiter
   ↓
TypeSafe API
```

错误处理：

```text
401     API Key invalid
429     exponential backoff
5xx     retry 1~2 times
timeout retry once
other   keep visible
```

任何无法确定的情况：

```text
Fail Open
```

即：

> 保持评论显示。

---

# 21. Cache

X 在滚动时可能反复 mount 同一条 Tweet。

Cache key：

```text
SHA256(
  normalizedContent +
  rulesFingerprint +
  modelVersion
)
```

结果：

```json
{
  "results": {
    "sexual_content": 0.93,
    "sexual_solicitation": 0.71
  },
  "createdAt": 1789699386154
}
```

默认：

```text
TTL = 24h
```

建议优先：

```text
chrome.storage.session
```

如果需要跨 session：

```text
IndexedDB
```

---

# 22. Rule Fingerprint

用户修改过滤规则后，旧 Cache 不能继续生效。

计算：

```js
rulesFingerprint = hash(
  enabledRules.map(rule => ({
    id: rule.id,
    instructions: rule.instructions,
    trueCriteria: rule.trueCriteria,
    falseCriteria: rule.falseCriteria
  }))
)
```

如果规则变化，自动生成新的 fingerprint。

Threshold 本身可以不进入模型 cache，因为 threshold 只影响本地 decision。

---

# 23. 评论隐藏 UI

不要直接彻底删除。

替换为占位符：

```text
────────────────────────────
🙈 Elon的工作隐藏了一条评论

色情 / 性暗示 · 93%

[查看评论]
────────────────────────────
```

如果命中多个规则：

```text
🙈 Elon的工作隐藏了一条评论

色情 / 性暗示 · 93%
色情引流 / 招揽 · 84%

[查看评论]
```

用户点击：

```text
查看评论
```

只恢复当前评论。

可增加：

```text
这条判断不对
```

MVP 只记录本地反馈，不自动修改规则。

---

# 24. 评论闪现问题

默认行为：

```text
评论先显示
   ↓
API 返回
   ↓
命中则隐藏
```

优点：

- 页面不会因为 API 慢而卡住
- API 失败不会影响阅读

缺点：

- 可能短暂看到色情内容

高级设置可以提供：

```text
在判断完成前隐藏新评论
[ OFF ]
```

开启后：

```text
新评论
   ↓
visibility: hidden
   ↓
AI 判断
   ↓
safe → 显示
hit  → 显示隐藏占位符
```

MVP 默认关闭。

---

# 25. 本地快速规则

本地规则只建议用于非常明确的：

```text
ALLOW
```

例如：

```js
if (!text || text.trim().length < 2) {
  return SAFE
}
```

不建议 MVP 用：

```js
if (text.includes("骚")) {
  hide()
}
```

因为容易误伤。

AI 语义判断应保持为核心。

---

# 26. API 成本保护

Settings：

```text
API Usage

本次浏览
231 requests

每日最大请求数
[ 100000 ]

达到限制后
停止 AI 过滤
```

达到限额：

```text
今日 AI 过滤已暂停：达到请求上限。
```

不要继续静默产生 API 成本。

---

# 27. 隐私设计

默认发送给 TypeSafe：

```text
✓ 当前评论文本
```

默认不发送：

```text
✗ X Cookie
✗ X 登录信息
✗ Browser History
✗ 当前用户 X 账号信息
✗ Root Tweet
✗ 当前页面其他评论
```

设置页应明确显示。

---

# 28. Manifest V3 权限

尽量最小化：

```json
{
  "manifest_version": 3,
  "name": "Elon的工作",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://x.com/*",
    "https://<typesafe-api-host>/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://x.com/*"],
      "js": ["content.js"]
    }
  ],
  "background": {
    "service_worker": "background.js"
  }
}
```

MVP 不申请：

```text
tabs
history
cookies
webRequest
<all_urls>
```

除非后续功能需要。

---

# 29. 推荐代码结构

```text
src/
├── background/
│   ├── index.js
│   ├── typesafe-client.js
│   ├── request-queue.js
│   └── classifier.js
│
├── content/
│   ├── index.js
│   ├── x-adapter.js
│   ├── observer.js
│   ├── extractor.js
│   ├── renderer.js
│   └── cache.js
│
├── rules/
│   ├── defaults.js
│   ├── compiler.js
│   └── decision.js
│
├── onboarding/
│   └── ...
│
├── popup/
│   └── ...
│
├── settings/
│   └── ...
│
└── shared/
    ├── storage.js
    ├── messages.js
    └── constants.js
```

---

# 30. Extension Message Protocol

## CLASSIFY_COMMENT

Content Script：

```json
{
  "type": "CLASSIFY_COMMENT",
  "payload": {
    "tweetId": "123456",
    "text": "..."
  }
}
```

Service Worker：

```json
{
  "ok": true,
  "shouldHide": true,
  "matches": [
    {
      "ruleId": "sexual_content",
      "probability": 0.93
    }
  ]
}
```

失败：

```json
{
  "ok": false,
  "error": "API_TIMEOUT"
}
```

Content Script 在失败时不隐藏评论。

---

# 31. Classification 状态机

```text
UNSEEN
  ↓
PENDING
  ↓
├── SAFE
├── HIDDEN
└── ERROR
```

状态定义：

```js
const CommentState = {
  UNSEEN: "unseen",
  PENDING: "pending",
  SAFE: "safe",
  HIDDEN: "hidden",
  ERROR: "error"
}
```

---

# 32. Analytics

MVP 可以完全不做 Analytics。

如果后续增加，只允许统计：

```text
extension_installed
filter_enabled
custom_rule_created
comment_hidden_count
classification_error
```

禁止上传：

```text
评论原文
API Key
X Username
Tweet URL
Tweet ID
```

---

# 33. Debug Mode

高级设置：

```text
Debug Mode
[ OFF ]
```

开启后本地 Console 可看到：

```text
Tweet ID
Content hash
Matched rules
Probabilities
Request latency
Cache hit / miss
```

不能显示：

```text
TypeSafe API Key
```

---

# 34. MVP 验收标准

## 功能

- [ ] 安装后自动进入 Onboarding
- [ ] 用户可以保存 TypeSafe API Key
- [ ] 可以测试 API Key
- [ ] 默认有 2 条过滤规则
- [ ] 用户可以新增过滤规则
- [ ] 用户可以修改 threshold
- [ ] 用户可以关闭规则
- [ ] Tweet Detail 页面自动识别评论
- [ ] Root Tweet 不被过滤
- [ ] 高置信度命中自动隐藏
- [ ] 隐藏评论可展开查看
- [ ] API 失败时不隐藏评论
- [ ] 相同评论不会重复大量请求
- [ ] X SPA 页面切换后继续工作

## 安全 / 隐私

- [ ] API Key 不进入 X DOM
- [ ] API Key 不进入日志
- [ ] 评论文本不经过自建服务器
- [ ] 不读取 X Cookie
- [ ] 不读取浏览历史
- [ ] Chrome 权限最小化

## 性能

- [ ] DOM Observer 不明显影响 X 滚动
- [ ] 默认请求并发不超过 3
- [ ] 重复评论优先命中 Cache
- [ ] API 慢或失败不会阻塞评论区

---

# 35. MVP 测试集

开发阶段需要建立一个最小 benchmark。

建议至少：

```text
正常评论                 100
普通恋爱 / 暧昧           50
性相关医学 / 教育         50
明确色情                 100
性暗示 / 擦边            100
色情引流                 100
网络黑话 / emoji          100
长数字 / 联系方式         50
```

总计：

```text
650+
```

每条人工标注：

```text
ALLOW
HIDE
```

重点衡量：

```text
Precision
Recall
False Positive Rate
```

插件第一版优先：

```text
Precision > Recall
```

因为错误隐藏正常评论比漏掉少数垃圾评论更影响信任。

---

# 36. 建议的第一版成功指标

不必一开始追求复杂增长指标。

核心只看：

```text
1. 用户开启插件后的留存
2. 每 100 条隐藏评论中的误伤数量
3. 用户主动点击“查看评论”的比例
4. 用户关闭默认规则的比例
5. API Error Rate
6. 平均 Classification Latency
```

其中最重要的是：

```text
False Positive Rate
```

---

# 37. 后续版本

## v0.2

- 用户反馈 “判断错误”
- Allow List
- 按语言设置不同规则
- 批量分类
- 更智能的本地 pre-filter
- API 用量展示

## v0.3

- 图片 / 视频 NSFW
- 账号级 Spam 评分
- Timeline 过滤
- 用户共享 Rule Pack

例如：

```text
NSFW Cleaner
Crypto Spam
Political Spam
AI Reply Slop
Engagement Farming
Scam
```

## v1.0

把产品从“色情评论过滤器”扩展成：

> **用户自己定义 X 评论区应该长什么样。**

---

# 38. MVP 最核心的数据流

```text
用户打开 X Tweet
        ↓
发现 Reply
        ↓
读取评论文本
        ↓
检查 Cache
        ↓
组合用户启用的 Jev Questions
        ↓
Service Worker 请求 TypeSafe
        ↓
得到每条 Rule 的 p(true)
        ↓
与用户 threshold 比较
        ↓
任一规则命中
        ↓
隐藏评论
        ↓
保留“查看评论”入口
```

这就是“Elon的工作”第一版需要完成的完整闭环。
