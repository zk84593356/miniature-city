# Miniature City 逆向笔记（engine-notes）

> 本文只陈述源站事实；未坐实项标记为 **[未确认]**。坐标以
> `mirror/_pretty/` 为准，由 `js-beautify@1.15.1` 生成。换版本会使全部行号失效。

## 第一部分：源站事实

### 1. 坐标系与 bundle 形态

- 目标是 Vite/esbuild 风格的 scope-hoisted ESM 双 chunk，没有 webpack/Turbopack 模块容器。
- `index-zfVzkv9E.js`：1,020,907 字节，展开后 26,962 行，SHA-256
  `bd2411b90aff0e56ec59467180f71fd8d9e0cc7f660666a8db2668a393072f5e`。
- `traffic-Cw95n69J.js`：19,604 字节，展开后 700 行，SHA-256
  `dc544a32c4ecdb4391082b1b7e96924a6b25f5b7236e89a49f0c2c6eba2ebb17`。
- 坐标载体是固定镜像字节，稳定性由源文件 SHA-256 与固定 beautifier 版本共同保证。
- chunk 图与逐文件账本见 `docs/chunk-graph.md`、`docs/bundle-census.json`。

### 2. bundle 区段地图

| 区间 | 区段 | 性质 |
|---|---|---|
| 主包 pretty L1-L69 | modulepreload 兼容启动器 | 构建器前奏 |
| 主包 pretty L70-L18495 | Three.js r185 核心及 WebGLRenderer | vendor |
| 主包 pretty L18496-L18595 | BufferGeometryUtils 合并工具 | vendor addon |
| 主包 pretty L18596-L25520 | 城市数据、解码、地形、建筑、灯光、活动与时钟 | 应用代码 |
| 主包 pretty L25521-L25998 | OrbitControls 及输入处理 | vendor addon 岛 |
| 主包 pretty L25999-L26959 | 相机控制、界面、标签、小地图与启动/销毁 | 应用代码 |
| 主包 pretty L26960-L26962 | 交通 chunk 所需 Three.js 别名导出 | chunk 接缝 |
| traffic pretty L1-L23 | 从主包导入 Three.js/工具别名 | chunk 接缝 |
| traffic pretty L24-L697 | 交通需求曲线、仿真和实例化渲染 | 应用代码 |
| traffic pretty L698-L700 | `createTraffic` 导出 | chunk 接缝 |

### 3. 技术栈取证

| 依赖 | 版本 | 证据 |
|---|---|---|
| Three.js | r185 / 0.185.x | 主包 pretty L70 `const o1 = "185"`；L7804-L7809 向 devtools/window 发布该 revision |
| OrbitControls | 与 Three.js r185 同包 | 主包 pretty L25521-L25998；API 与主包 Three 类型直接共享 |
| UI/应用框架 | 无 | 主包 pretty L26134-L26628 直接创建 DOM；无 React/Vue/R3F 启动器 |
| bundler | Vite/esbuild 形态，精确版本 [未确认] | HTML 单 module 入口、modulepreload 前奏、动态 `import("./traffic-…")`；bundle 内无版本字符串 |

### 4. 关键混淆名对照

| 混淆名 | 语义 | 定义/证据 |
|---|---|---|
| `n4` | WebGLRenderer | 主包 pretty L17758 |
| `n0` | Scene | 主包 pretty L3329 |
| `mn` | PerspectiveCamera | 主包 pretty L7382，启动链 L26675 以 FOV 40 构造 |
| `W4` / `Tt` | 性能记录器 / 单例 | 主包 pretty L21012-L21079 |
| `j4` | 地理投影与高度采样器 | 主包 pretty L21222-L21411 |
| `p6` | 天空、太阳和昼夜光照控制 | 主包 pretty L22116-L22234 |
| `A7` | OrbitControls | 主包 pretty L25521-L25998 |
| `B7` | 城市相机控制器 | 主包 pretty L25999-L26133 |
| `H7` | 主界面控制器 | 主包 pretty L26134-L26405 |
| `W7` | 3D 地点标签层 | 主包 pretty L26406-L26548 |
| `X7` | 2D 小地图 | 主包 pretty L26549-L26628 |
| `Y7` | 页面启动与生命周期总装配 | 主包 pretty L26638-L26959 |
| `at` | 交通仿真 | traffic pretty L118-L422 |
| `ot` | 交通渲染器 | traffic pretty L438-L669 |
| `ht` / `createTraffic` | 交通子系统工厂 | traffic pretty L670-L700 |

### 5. 启动链与生命周期

1. HTML 提供 `#app` 与 `#loading`，主包取得节点并初始化视口/语言（主包 pretty L26629-L26637）。
2. `Y7` 创建 AbortController、pagehide 中止器并先验证 WebGL2（L26638-L26657）。
3. 并行读取地理、地形、路面和活动数据（`Z4`，L21172-L21182），随后建立 Scene、FOV 40 相机和 WebGLRenderer（L26672-L26685）。
4. 先装配地形、天空与海岸，渲染第一帧；再并行装配地标与城市实例（L26695-L26724）。
5. 装配活动、夜间道路照明、局部灯光、UI、标签和小地图（L26724-L26816）。
6. 主渲染循环每帧更新质量判定、时钟、相机、声景、天空、地标、海岸、城市、活动、标签和渲染器（L26855-L26867）。
7. 交通通过动态 chunk 延后加载；失败只显示“仍可继续探索”并保留核心城市（L26935-L26955）。
8. 非 bfcache pagehide 会解除监听、dispose 几何/材质/renderer；bfcache pageshow 只恢复 rAF（L26885-L26919）。

### 6. 渲染管线与关键参数

- 单 Scene + PerspectiveCamera + WebGLRenderer，没有独立后处理 composer（启动链 L26672-L26695）。
- 相机：FOV 40、near `.04`、far `7500`；运行时 near 以 `max(.12, distance/180)` 调整（L26675、L26120-L26129）。
- renderer：`antialias:true`、`alpha:false`、`preserveDrawingBuffer:true`、`powerPreference:"high-performance"`（L26676-L26682）。
- 像素比：精细模式 `min(devicePixelRatio,1.5)`，轻量模式上限 1；轻量模式关闭实时阴影（L26660-L26683）。
- tone mapping 使用 Three.js ACESFilmic 常量，exposure `.96`（L26682-L26685）。
- 场景主体由地形、道路/水面、建筑实例、地标模型、活动、交通、灯光与天空层组成；不存在“DOM 假 3D”替代主体。

### 7. 数据与私有格式

主包 pretty L20889-L21192 是权威读取合同。清单以数据集 id
`1698daaff6b5c630` 绑定全部文件（L20900-L21009）。

| 资产 | 合同 |
|---|---|
| geography JSON | `projection, land, city, districts, coast` |
| elevation JSON | `origin, step, width, height, values, source` |
| surfaces JSON | `details, coastal, houhai` |
| activity JSON | `version, source, ferries, ferryBerth, port, validation` |
| terrain meta + bin | schemaVersion 1；bin 为 `byteplanes-v1`，4 字节平面反交织，predictor 3；解析为 city/context 的 Float32 vertices 与 Uint32 indices |
| urban meta + bin | schemaVersion 1；`chunks, treeOffset, treeCount, count, palette, treeStyleSeed`；bin predictor 8 |
| traffic meta + points bin | meta 含 lanes/junctions/observations；points bin predictor 3，按 12 字节 Float32 坐标读取 |
| traffic demand JSON | `version, dataset, capacity, seed, itineraries, note` |
| buildings JSON | 7,491 条建筑记录数组 |

`H4` 负责字节平面还原（L20889-L20900）；`q4` 解析地形（L21080-L21094）；`Y4` 解析交通点（L21095-L21107）；所有 fetch 均为同源 `/data/…`（L21158-L21192）。

### 8. Shader 清单

| 用途 | 坐标 |
|---|---|
| 近景路灯光池 | 主包 pretty L18642-L18647 |
| 夜间道路点灯 | 主包 pretty L18657-L18662 |
| 地点局部光池 | 主包 pretty L18745-L18750 |
| 水面/环境着色 | 主包 pretty L22146-L22164 |
| 天空、太阳与星点 | 主包 pretty L22174-L22176 |
| 交通远景点精灵 | traffic pretty L468-L478 |

### 9. 动画与输入参数

- OrbitControls：damping `.075`，距离 `2.4..1250`，polar `.12..1.37`，pan `.7`，rotate `.65`，初始 zoom `.85`，zoomToCursor 开启（主包 pretty L26001-L26014）。
- 相机飞行默认 `3.6s`，使用 quintic smootherstep `t³(t(6t-15)+10)`；大跨度飞行抬升 `min(110,d*.24)`，小跨度 `min(4,d*.08)`（L26055-L26085、L26109-L26116）。
- 城市总览目标 `(114.18,22.648)`，距离 980，方位 180°，仰角 1 rad，时长 5s（L26091-L26094）。
- 日/落/夜预设分钟为 720 / 1110 / 1320（L26743-L26746）。
- reduced-motion 时相机飞行直接落位、车船与装饰动画暂停，但手动探索保留（L26062-L26067、L26875-L26879）。

### 10. DOM、路由与状态

- 单路由 `/`；没有客户端路由器。
- HTML 是静态加载外壳，完整操作界面由 `H7` 在运行时构建（主包 pretty L26134-L26405）。
- 状态包括 selected、region、time preset、minute、clock mode、day type、motion paused、near、quality、language、camera/target/distance、UI hidden 等；调试快照由启动链末段登记（L26903-L26934）。
- UI 覆盖中英文、10 个区域、19 个地点、日/落/夜、城市时钟、画质、标签、行政界线、截图、声景、键鼠与触控。

### 11. 已证伪假设

| 假设 | 结论 | 证据 |
|---|---|---|
| React/R3F 或 Vue 承载视觉主体 | 证伪 | DOM 与 WebGL 都由命令式主包直接创建，L26134-L26685 |
| 依赖运行时业务 API | 证伪 | 运行时抓包只命中 19 个静态资源；主包 fetch 均指向 `/data/…` |
| 多页面/隐藏路由 | 证伪 | HTML 与交互均围绕单根路由；本地 `/` 200、未知路径 404 |
| 静态 BFS 已覆盖全部资源 | 证伪后销账 | CDP 发现 13 个运行时数据文件；补录后 GAP=0 |
| 页面是静态图片或预渲染视频 | 证伪 | 可见浏览器实测进入 WebGL Canvas；相机、昼夜、标签和小地图均可交互 |

## 第二部分：怪癖清单（照抄不修）

| # | 怪癖 | 坐标 |
|---|---|---|
| Q1 | 交通是可选延迟子系统；失败只 warning，并允许继续探索核心城市 | 主包 pretty L26935-L26955 |
| Q2 | `KeyH` 与 `KeyF` 都回到全市概览，而帮助文案只公开 H | 主包 pretty L26831-L26846 |
| Q3 | 页面保留外部 attribution/资料锚点，但运行时不主动请求这些主机 | 主包 pretty L26134-L26405 |
| Q4 | WebGL2 不可用时直接进入错误卡片，不提供 Canvas/DOM 降级渲染 | 主包 pretty L26649-L26657、L26957-L26959 |

## 第三部分：对复刻的直接结论

1. DOM 采用静态外壳策略 A；从镜像生成 `site/`，只登记 noindex 与遥测 stub，不重写应用行为。
2. scope-hoisted 双 chunk 不做结构性重写；用拼接式切片建立 `src/readable/`，重拼 SHA-256 必须与原 chunk 完全一致。
3. 数据文件和原始 chunk 是行为合同的一部分；不得转换二进制格式、重采样地形或替换城市资产。
4. Three.js r185、OrbitControls、相机/时钟/画质/Shader 数值全部按现有字节执行，不凭观感调参。
5. 交通 chunk 必须保持动态加载和可失败语义；不得合并进主启动路径。
6. 公开部署未获授权决定前保持私有、noindex、不部署。
