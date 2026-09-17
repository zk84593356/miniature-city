# Miniature City rebuild 重建计划

> 源站：`https://cityinminiatures.top/`　开工：2026-09-16　终点：L3 源码化。
> 工具链：website-rebuild skill v0.3.23（`SKILL.md` SHA-256 前 12 位 `4c99deef5caf`，runtime：Codex）。
> 默认发布策略：私有、`noindex`、不公开部署；这是一项安全默认，不是法务结论。

## §0 执行纪律

1. **源站代码是唯一裁决**：每个行为结论先归属到 `mirror/_pretty/*.pretty.js` 行号再落地。
2. **源站有的都要有，没有的不做**；bug 与死代码照抄不修，登记到 §Q。
3. **有意偏差必须登记**在 §6；未登记的差异一律视为 bug。
4. 不自创补偿性 CSS/JS，不凭观感调视觉或动画参数。
5. 每个里程碑过全新加载实测与机器门。
6. 代码与文档同一次提交；当前目录没有 Git 仓库，日志以文件状态和门结果代替 commit id。

## §1 镜像清单与外部依赖

- 镜像时间：2026-09-16；权威内容 19 文件，连账本共 25 文件、27.40 MiB；清单：`mirror/mirror-manifest.json`。
- 抓取：BFS 静态爬取 + 双视口真实浏览器抓包 + 13 条运行时 seed 补录 + SHA-256/闭包复核。
- M0：`verify-mirror` 全门 PASS；manifest 映射单射、哈希/尺寸一致、库存一致、真实性与闭包均通过。
- M0.5：本地 `/` 为 200、未知路径为 404；`verify-offline` 报 0 个静态外联问题；可见浏览器实测加载层移除、Canvas 与界面就绪、控制台 warning/error 均为 0。
- 原站 `robots.txt` 返回 404，不存在可应用的路径规则。

| 外部依赖 | 用途 | 决策 | 理由 |
|---|---|---|---|
| `static.cloudflareinsights.com` | Cloudflare 分析 beacon | 接受降级并由本地服务 stub | 非视觉/交互资产；离线运行不得外联 |
| OpenStreetMap / Mapzen /政府及建筑资料站 / GitHub | attribution 与资料锚点 | 保留可见链接，不主动请求 | 属来源说明，不是运行时依赖；已登记在 `mirror/external.txt` |

## §2 技术栈取证表

| 层 | 选型与精确版本 | 取证证据 |
|---|---|---|
| 运行形态 | 原生 DOM + 原生 ESM 单页 | 主包 pretty L26134-L26638；无框架启动器 |
| 3D | Three.js r185 / 0.185.x | 主包 pretty L70、L7804-L7809 |
| 相机输入 | OrbitControls（同 r185） | 主包 pretty L25521-L25998 |
| bundler | Vite/esbuild scope-hoisted，版本 [未确认] | modulepreload 前奏 + ESM 动态 chunk；无版本字面量 |
| 数据 | JSON + `byteplanes-v1` 二进制 | 主包 pretty L20889-L21192 |
| 交通 | 延迟 ESM chunk | 主包 pretty L26935-L26955；traffic pretty L1-L700 |
| 传递依赖 | 无项目运行时 npm 依赖 | `site/` 直接运行钉死镜像字节；源码化切片不改变执行 chunk |

## §3 镜像盲区销账

| # | 盲区资源 | 发现方式 | 状态 |
|---|---|---|---|
| 1 | 6 份城市/地形 JSON | CDP 抓包 diff | ☑ 已补 |
| 2 | terrain meta + binary | CDP 抓包 diff | ☑ 已补 |
| 3 | traffic meta/demand + points binary | CDP 抓包 diff | ☑ 已补 |
| 4 | urban meta + instances binary | CDP 抓包 diff | ☑ 已补 |
| 5 | analytics beacon | off-host 普查 | ☑ 已登记为 accepted degradation |

补录合计 13 个运行时数据文件；最终 `netcapture.tsv` 为 GAP=0。

## §4 阶段计划

| 里程碑 | 范围 | 验收标准 | 状态 |
|---|---|---|---|
| M0 | 镜像取证 | manifest 齐、CDP GAP=0、外部依赖表齐 | ☑ |
| M0.5 | 镜像离线运行 | `/` 200、未知 404、零外联、可见浏览器 0 console error | ☑ |
| M1 | 坐标系与逆向笔记 | pretty 固定、chunk census、engine-notes 三段齐 | ☑ |
| M2 | 生成式 `site/` | 从镜像可复现生成；noindex；`build-site --check` | ☑ |
| M3 | L3 拼接式源码层 | 两个 chunk 均切片；reassembly 与活原件 SHA-256 全等 | ☑ |
| M4 | 验证与冷头审计 | 资源引用、路由、离线、声明清点全绿 | ☑ |
| M5 | 收口 | DEPLOY 取证完成；公开决定交回用户 | ☑（本地收口；公开待决定） |
| M6 | 授权公开衍生版 | 深圳 3D 完整保留；品牌/署名/部署层独立；公开门全绿 | ☑（待部署） |

### §4.1 改动区域到最小门集合

| 区域 | 最小门集合 |
|---|---|
| HTML 外壳 / noindex | `build-site --check` + `verify-shell` |
| 运行资产 | `verify-refs-served` + `verify-offline` + 可见浏览器冷启动 |
| scope-hoisted 可读切片 | `verify-reassembly --against site/assets` |
| 验收工具 | `verify-zerodep` |
| WebGL 视觉与交互 | 可见浏览器非空画面、Canvas/UI ready、控制台零 error/warning；运行字节与镜像相同使 M0.5 结论传递 |

## §5 难点与风险评级

| 分项 | 评级 | 说明 |
|---|---:|---|
| 素材获取 | ★★★★ | 19 个权威资源含 3 个大二进制与多份城市数据 |
| 3D/WebGL | ★★★★ | 全市级场景、实例建筑、地标、昼夜、灯光、活动和交通 |
| 动画/交互 | ★★★ | OrbitControls、相机飞行、城市时钟、声景、标签与多模式 UI |
| 私有格式 | ★★★ | byteplanes 反交织 + predictor + typed-array 合同 |
| 平台层 | ★ | 静态单页，无 CMS/登录/业务 API |
| 素材版权 | ★★★★ | OSM/Mapzen 与多来源资料、音频和城市资产需公开前逐项判断 |
| 环境 | ★★★ | 本机 headless GPU 进程崩溃；可见浏览器正常，门需区分环境失败与页面失败 |

## §6 有意偏差登记表

| # | 源站怎么做 | 我们怎么做 | 为什么 | 重新考虑条件 |
|---|---|---|---|---|
| 6.1 | 页面尝试加载 Cloudflare analytics | 本地服务对该主机 stub，产物不外联 | 遥测不属于视觉/交互合同，离线门要求零外联 | 若用户明确需要并获准部署分析服务 |
| 6.2 | HTML 未声明 noindex | 生成 `site/` 时注入 noindex | 未完成版权决定前按安全默认保持私有 | 用户完成版权判断并明确选择公开 |
| 6.3 | 源站直接运行压缩 chunk | 另附 byte-identical 拼接切片作为可读研究层，执行仍用原 chunk | scope-hoisted 求值顺序不可任意重写；字节门提供强等价证明 | 获得原始 sourcemap/source 或完成带全门的结构性重构 |
| 6.4 | 单一站点品牌“Shenzhen in Miniature” | 公开版使用“微缩城市图志 / Miniature City Atlas”，深圳作为首个真实城市 | 用户计划以后扩展大理等真实城市；平台品牌需与城市身份分离 | 用户指定新的平台品牌 |
| 6.5 | 原站直接展示资料署名 | 公开版增加独立署名、隐私、授权说明和城市 registry/manifest | 满足公开部署和未来多城市扩展需要 | 许可或托管政策变化 |

## §Q 源站怪癖登记表

| # | 怪癖现象 | 证据 | 处置 |
|---|---|---|---|
| Q1 | 交通延迟加载失败只 warning，核心城市继续运行 | 主包 pretty L26935-L26955 | 照抄不修 |
| Q2 | H 与 F 均回到全市概览，但文案只公开 H | 主包 pretty L26831-L26846 | 照抄不修 |
| Q3 | WebGL2 不可用即错误卡片，无替代渲染 | 主包 pretty L26649-L26657 | 照抄不修 |

## §7 里程碑日志（倒序）

### M6 授权公开衍生版（2026-09-17，commit n/a）

- **决定**：用户选择 B，并确认拥有应用代码、三维资产、数据、文案和声景的公开使用授权。
- **产出**：`public-site/`、`public-overlay/`、可重复生成与验证脚本、深圳城市 registry/manifest、署名和隐私页面。
- **不变项**：地形、建筑、地标、交通、昼夜、相机、交互、音频及全部数据文件保持原字节；仅 `index.html` 和主 bundle 中的登记品牌文字发生变化。
- **验收**：19 个运行文件全部入账，非文字资产 byte-identical；冷加载品牌生效，中英切换正常，10 个区域入口存在，可见浏览器控制台 warning/error 为 0。
- **发布状态**：未公开部署；保留 `noindex`，待选择 Cloudflare Pages 或 VPS 并确认正式域名。

### M5 本地收口（2026-09-17，commit n/a）

- **产出**：`DEPLOY.md`；素材体量、第三方标识、权利未知项、来源混淆和三条发布路径均已登记。
- **安全默认**：站点保持私有、`noindex`、未公开部署；这不是替用户作出的永久发布决定。
- **公开断点**：如需公开，先由用户选择发布路径，并对应用代码、文案、音频、城市数据和品牌表达补齐授权或替换证据。

### M4 终检（2026-09-17，commit n/a）

- **机器门**：`npm run verify` 全绿；生成可重复、shell 差异可重放、144/144 切片逐字重组、67 个脚本文件零外部依赖。
- **运行门**：`verify-offline` 静态外联 0；`verify-refs-served` 2/2 引用可响应；root=200、missing=404、noindex=true。
- **可见浏览器**：1280×720 冷启动 Canvas/UI ready，10 个区域入口可见，中英切换与声音开关正常，控制台 warning/error 均为 0。
- **冷头覆盖**：目标是 scope-hoisted bundle，不存在可靠的原始声明边界；144 部件对活原件的完整字节重组比抽样声明清点覆盖更强，执行包未被改写。

### M3 L3 拼接式源码层（2026-09-17，commit n/a）

- **产出**：`src/readable/index-zfVzkv9E/` 140 片；`src/readable/traffic-Cw95n69J/` 4 片；每片均带 sidecar SHA-256/字节区间。
- **验收**：144/144 部件哈希正确；两目录按序重拼分别等于活的 `site/assets/` 原件，主包 `bd2411b90aff…`、交通包 `dc544a32c4ec…`。
- **环境修正**：Windows 下 Node 不能直接 spawn `npx`/`npx.cmd`，`slice-esm.mjs` 改为以 `node.exe` 启动同目录 `npx-cli.js`；Acorn 版本与算法仍钉死为 8.14.0。
- **下一步断点**：运行资源可达、零外联、工具零依赖和浏览器冷启动终检。

### M2 生成式 site（2026-09-17，commit n/a）

- **产出**：完整 `site/`；`scripts/shell-config.mjs`；根目录零依赖启动与验证命令。
- **验收**：`build-site --check` byte-for-byte PASS；`verify-shell` 1/1 差异 hunk 可由 T-NOINDEX 重放；运行资产均逐字复制。
- **偏差**：只有 §6.1 analytics stub 与 §6.2 私有 noindex；执行 chunk 未改写。
- **下一步断点**：L3 拼接式源码层。

### M1 坐标系与逆向笔记（2026-09-17，commit n/a）

- **产出**：两 chunk census；js-beautify 1.15.1 坐标系；`docs/engine-notes.md`；技术栈/数据/启动链/参数证据。
- **验收**：主包 26,962 行、交通包 700 行；源文件 SHA-256 已钉；文档事实/怪癖/结论三段齐。
- **教训**：目标不是模块容器；应走 scope-hoisted 拼接式分解，不应伪造模块边界。
- **下一步断点**：主包 pretty L1-L26962 与 traffic pretty L1-L700 进入 `slice-esm` 字节切片。

### M0.5 离线镜像（2026-09-17，commit n/a）

- **产出**：本地服务、外联 stub、静态离线门、可见浏览器实测。
- **验收**：root=200、missing=404；静态外联 0；Canvas/UI ready；warning/error 0。
- **教训**：Windows headless Chrome/Edge 在 GPU/CDP domain 阶段会崩溃，但同机可见浏览器 WebGL 正常；该问题不得归因为页面。
- **下一步断点**：主包版本/区段地图与数据合同。

### M0 镜像取证（2026-09-16，commit n/a）

- **产出**：19 个权威文件及三本账；13 个运行时资源补录；`external.txt`。
- **验收**：`verify-mirror` PASS；netcapture GAP=0；所有记录哈希与尺寸一致。
- **教训**：动态 `/data/` URL 无法仅靠 HTML/CSS BFS 覆盖，必须由真实浏览器抓包补录。
- **下一步断点**：M0.5 本地断网伺服。
