# 界面扩展约定

本次在 daily-arXiv-ai-enhanced 原界面上增加两种推荐排序与概括来源提示。既有代码是视觉依据；不另建视觉系统。页面仍以日期、分类、偏好、论文卡片和详情为主线。

## 沿用的样式

[基础样式](../css/styles.css) 保留 Inter 与系统字体回退、浅色背景（`#fafbff`）、白色卡片、蓝紫渐变（`#667eea` → `#764ba2`）、正文（`#1e293b`）及次级正文（`#475569`）。继续使用原有 8/12px 圆角、轻阴影、卡片标题 16px、摘要 14px，以及桌面最大宽度 1440px 的容器。

标志、页头、分类和偏好标签、论文卡片、日期选择器、详情弹窗及设置表单沿用原结构。[首页](../index.html) 与[设置页](../settings.html) 均在基础样式之后加载 [recommendations.css](../css/recommendations.css)，由该文件集中提供本次扩展与修正。设置页另保留原有 `css/settings.css`。

## 新增组件与交互

| 来源或选择器 | 约定 |
| --- | --- |
| `.recommendation-toolbar`、`.recommendation-switch` | 列表上方显示“原版推荐 / Zotero 推荐”。使用原生按钮组成 `role="group"`，以 `aria-pressed` 表示选中；选中态为白底、紫色文字、轻阴影，按钮最小高度 44px。 |
| `[data-recommendation]` | 切换在当前归档内重新排序，保存到本地偏好；排序本身不调用 Zotero 或模型 API。 |
| `#recommendationStatus` | 使用 `role="status"` 与 `aria-live="polite"`，说明排序依据、当前论文数、中文概括数，以及生成失败后的原摘要回退。无 Zotero 分数时明确提示按原顺序显示。 |
| `.paper-annotations`、`.zotero-score` | 展示可用的 Zotero 相关性分数；分数保留两位小数，提示其不是概率。分数缺失时不补造数字。 |
| `.summary-source`、`[data-ai="true"]` | 区分“DeepSeek 中文概括”“原始摘要”；演示模式使用“演示中文概括”。生成失败、达到额度、未进入生成范围时保留原摘要，并通过来源提示解释状态。文字标记与颜色同时表达来源。 |
| `.demo-notice` | 演示模式显示黄色提示，明确数据用于交互预览，并非用户的 Zotero 推荐或真实模型结果。 |

排序实现见 [js/recommendations.js](../js/recommendations.js)：原版推荐将关键词或作者命中的论文置前，其余仍可浏览；Zotero 推荐先显示有分数的论文，再按分数降序，同分保持归档顺序。搜索词存在时，两种模式均先将文本命中置前，再应用所选排序；搜索并非隐藏所有未命中的论文。

日期与日期范围、分类选择、搜索入口和详情继续可用。分类决定当前论文集合；推荐切换只改变该集合的顺序。设置页明确说明关键词、作者影响原版推荐，Zotero 推荐依据文献库相似度。控制状态、来源提示和列表渲染见 [js/app.js](../js/app.js) 的 `initRecommendationControls`、`updateRecommendationStatus`、`paperAnnotations`、`renderPapers`。

## 本次可访问性与手机修正

- 扩展样式将日期、页脚等三级文字所用的 `--text-tertiary` 调为 `#64748b`；论文链接及页脚链接调为 `#4d55b2`，保留既有蓝紫色系。
- 按钮、链接、输入框和可聚焦论文卡片使用 3px 紫色 `:focus-visible` 外框。论文卡片支持键盘打开，详情关闭后回到原焦点；对应实现位于 `js/app.js`。
- 基础样式原有 768px 响应式规则继续生效；新增 600px 规则将页头改为单列，标题允许换行，控制区允许折行，修复 360/390px 宽度下的页头溢出。
- 小屏推荐按钮等宽铺满一行，状态说明另起一行；分类与偏好滚动区域允许收缩；论文列表及详情分节使用 `minmax(0, 1fr)`，详情页脚按钮可折行。长标题和摘要可断行。
- 系统选择减少动态效果时，推荐切换子元素与论文卡片停用动画和过渡。该规则仅覆盖上述组件。

## 验收材料与边界

最终界面评审结论为可交付，范围限于界面与演示交互。以下截图只在本地留存，不随源码提交；可使用 README 中的演示命令重新生成界面：

- 桌面首页：`.impeccable/review/desktop.png`
- 390px 手机首页：`.impeccable/review/mobile.png`
- 360px 手机首页：`.impeccable/review/mobile-360.png`
- 手机详情：`.impeccable/review/mobile-detail.png`
- 手机日期选择：`.impeccable/review/mobile-date.png`

截图用于确认布局与可见状态。演示数据只证明两种排序、分类、搜索、日期和详情等界面可展示与交互，不能证明真实 Zotero 文献库连接、个性化分数质量、DeepSeek 实际生成或每日更新任务已经成功执行。正式数据模式由 [js/data-config.js](../js/data-config.js) 配置；真实服务的配置与验证应按 [setup.html](../setup.html) 执行，并保留独立运行证据。
