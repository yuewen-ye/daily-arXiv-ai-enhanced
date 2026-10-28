# Daily arXiv · 关键词与 Zotero 双推荐

基于 [daily-arXiv-ai-enhanced](https://github.com/dw-dengwei/daily-arXiv-ai-enhanced) 的个人阅读站点，保留原有日期、分类、作者和关键词浏览，增加基于 Zotero 文献库的语义推荐。算法规则参考 [zotero-arxiv-daily](https://github.com/TideDra/zotero-arxiv-daily)。上游原说明保存在 [README.upstream.md](README.upstream.md)。

## 每天会发生什么

1. 抓取 arXiv 的 `cs.CV,cs.LG,cs.AI,cs.CL`，合并跨分类的重复论文。
2. 只读读取 Zotero 云端个人文献库中的会议、期刊、预印本条目，跳过无摘要条目。
3. 使用本地 CPU 嵌入模型计算摘要相似度，按 Zotero 入库先后加权，得到候选论文的分数与排名。
4. 只为 Zotero 前 50 篇尝试生成 DeepSeek 中文概括；其他论文保留原始摘要。成功结果缓存复用。
5. 保存日期归档和生成额度记录，并发布 GitHub Pages。

网页的“原版推荐”依旧把关键词或作者命中项置前，并保留其他论文；“Zotero 推荐”按语义分数排序。两者可以独立切换，类别和文本搜索在两个视图都可使用。关键词、作者偏好保存在浏览器，影响原版推荐，不影响后台的 Top 50 摘要选择。

## 线上部署

在你自己的公开 GitHub 派生仓库中：

1. Settings → Pages → Source 选择 **GitHub Actions**。
2. Settings → Secrets and variables → Actions，添加以下 **Repository secrets**：

| Secret | 内容 |
| --- | --- |
| `ZOTERO_ID` | 数字用户 ID，在 [Zotero API 设置](https://www.zotero.org/settings/keys) 查看 |
| `ZOTERO_KEY` | 同一页面创建的个人文献库只读 API 密钥；请先同步文献元数据 |
| `DEEPSEEK_API_KEY` | [DeepSeek 平台](https://platform.deepseek.com/api_keys) 的 API 密钥 |

3. Actions → **Publish reading UI** 可先发布空站点与配置说明。
4. 凭据齐备后，运行 **Daily papers · Zotero + DeepSeek**。此后按上游原计划每天 UTC 17:30（北京时间次日 01:30）运行；GitHub 的定时执行可能延迟。

无需邮件、SMTP 密码、OpenAI 账号或额外服务器。DeepSeek 默认走官方接口 `https://api.deepseek.com`，模型为当前官方的 `deepseek-flash`，显式关闭思考模式。即使其他上游脚本使用 OpenAI 兼容 SDK，也不意味着向 OpenAI 发请求。

可选 Repository **Variables**：

| Variable | 默认值 / 作用 |
| --- | --- |
| `CATEGORIES` | `cs.CV,cs.LG,cs.AI,cs.CL`，逗号分隔 |
| `SUMMARY_LIMIT` | `50`，每天最多发起的摘要生成请求次数；`0` 仅复用已有概括 |
| `DEEPSEEK_MODEL` | `deepseek-flash` |
| `EMBEDDING_MODEL` | `jinaai/jina-embeddings-v5-text-nano-retrieval`，CPU 本地计算 |
| `ZOTERO_INCLUDE_PATHS` | `null`，或 JSON 列表，例如 `["研究/图像生成/**"]` |
| `ZOTERO_IGNORE_PATHS` | `null`，或 JSON 列表，例如 `["归档/**"]` |

路径筛选遵循原项目的完整收藏夹路径：`*` 不跨目录、`**` 可跨目录。先 include，再 ignore；有 include 条件时，未归入收藏夹的条目不参与推荐。空列表等同不设置筛选。

## 不填密钥也能预览

```sh
python3 scripts/preview.py
python3 -m http.server 8765 --bind 127.0.0.1 --directory .preview
```

打开 http://127.0.0.1:8765。预览包含显著的演示标签和合成论文，不会连接 Zotero、下载模型或调用 DeepSeek。它只证明界面与交互可用。

## 在本机运行真实任务

安装 [uv](https://docs.astral.sh/uv/)，复制 `.env.example` 为 `.env` 并填写三个凭据，然后：

```sh
bash run.sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory _site
```

首次会下载 CPU 模型及依赖，不要求 GPU。程序通过 Zotero 云 API 读取已同步数据，不依赖本地 Zotero 正在运行。`.env` 由 uv 作为数据读取，不作为 shell 脚本执行。

## 缓存、费用与失败处理

- `_state/summaries.json`：公开新论文的成功概括缓存。缓存键包含论文 ID、标题、摘要、模型、语言和提示词版本；内容或模型改变才重新生成。
- `_state/usage.json`：按 UTC 日期记录请求次数。每次请求前先写入；失败和超时也消耗当天额度，不自动重试。重复运行先读已有记录；当天更换模型或候选排序也不会重置额度。
- `data/YYYY-MM-DD_AI_enhanced_Chinese.jsonl`：所有候选论文、推荐分数、摘要状态。名称沿用上游格式，部分记录没有 AI 字段时网页显示原摘要。
- `data/YYYY-MM-DD_status.json`：公开的运行计数，用于排查成功、缓存和失败数量。
- `_state` 与日期归档持久化到 `data` 分支；源码仍在 `main`，状态提交采用正常快进推送，不覆盖历史。
- 摘要 API 失败时保留原摘要，页面显示对应状态；Zotero 凭据错误或文献库没有合格摘要时停止任务，避免生成看似有效的假推荐。
- 网络读取状态分支失败时停止任务，不能把恢复失败误当成首次运行，否则会丢失额度记录。
- 工作流结束时会保存部分状态。若手动删除状态分支、硬终止任务导致状态未保存，或者同时在多台本地机器使用独立状态，不能保证跨这些环境的额度；正常线上任务通过并发串行化避免相互覆盖。

篇数与输出长度限制用于控制开销，并不承诺固定金额；实际费用以 DeepSeek 的使用量与账单为准。

## Zotero 算法与数据边界

按 `dateAdded` 倒序排列文献，第 i 条（从 0 开始）的原始权重为 `1 / (1 + log10(i + 1))`，归一化后，对候选摘要与各文献摘要的相似度加权求和，再乘 10。权重取决于入库排名，不是距离今天的天数；分数不是概率。

候选和 Zotero 摘要都使用原项目的 `task=retrieval, prompt_name=document` 编码，再调用嵌入模型的 similarity 方法，保留其相似度定义。默认模型的已验证版本记录在源码中。算法对照来源：[原排序规则](https://github.com/TideDra/zotero-arxiv-daily/blob/edc68632c9a861559ea376dfd34c3ab0b1e4f34a/src/zotero_arxiv_daily/reranker/base.py)、[原嵌入配置](https://github.com/TideDra/zotero-arxiv-daily/blob/edc68632c9a861559ea376dfd34c3ab0b1e4f34a/config/base.yaml)。

Zotero 原始条目、摘要和嵌入向量仅保留在运行进程内，不写入 data 分支、Actions 模型缓存或网页。DeepSeek 收到的是候选 arXiv 论文的标题和摘要。Pages 发布目录通过明确的文件清单构建，只包含网页、静态资源和公开结果，不包含 `.env`、源码、Zotero 数据或 `_state`。公开推荐结果本身会反映研究兴趣。

本版本保留上游的候选内容检查；该检查仅处理公开的候选论文或生成概括，不处理 Zotero 文献库。

## 验证与维护

```sh
uv sync --locked --extra zotero
uv run --extra zotero python -m unittest discover -s tests -v
PYTHONPATH=ai uv run python -m unittest discover -s ai/tests -v
node --test tests/recommendations.test.js
python3 scripts/build_site.py
```

测试覆盖原排序公式、云 API 分页和过滤、Top N、缓存命中、模型/内容变更、失败回退、重复执行额度、数据分支往返和发布目录边界。模拟客户端测试不证明真实账号或付费 API 已跑通；真实链路需在配置凭据后首次运行并核对任务结果。

若任务失败，先查看 Actions 的失败步骤。缺凭据则补齐 Secrets；空文献库则核对 Zotero 同步和摘要字段；模型下载失败可重跑。不要通过删除 `_state` 来修复，否则会同时删除当日额度记录。

上游项目与作者的版权声明和 LICENSE 保持在仓库中。
