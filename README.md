# 微缩城市图志

项目现在包含三套彼此隔离的产物：

- `site/`：对 `cityinminiatures.top` 的 L3 私有研究基线。
- `public-site/`：经权利方授权的公开衍生版，品牌为“微缩城市图志”，首个真实城市为深圳。
- `atlas-site/`：深圳原版与武汉城市预览的聚合产物；武汉位于 `/wuhan/`，使用独立 Three.js 入口与 City Pack。

公开版完整保留现有深圳地形、建筑、地标、交通、昼夜、相机、交互和声景；生成门保证所有非文字运行资产与基线逐字一致。当前仍带 `noindex`，尚未部署到公网。

## 本地运行

需要 Node.js 20 或更高版本，无需安装依赖：

```powershell
npm run serve
```

随后打开 <http://127.0.0.1:4173/>。

公开版使用：

```powershell
npm run public:verify
npm run public:serve
```

随后打开 <http://127.0.0.1:4174/>。单独发布深圳时，Cloudflare Pages 或 VPS 应发布 `public-site/`；双城聚合发布使用 `atlas-site/`，不要发布 `mirror/`、`site/` 或 `src/readable/`。

## 验证

武汉地标、地点与城市预览（需要安装已锁定的 Three.js 依赖；无需 GIS 环境即可使用仓库内的生成数据）：

```powershell
npm ci
npm run atlas:build
npm run atlas:verify
npm run atlas:serve
```

打开 <http://127.0.0.1:4175/wuhan/>。根路径仍为深圳。武汉在真实地形和水系上增加了 OSM 道路、普通建筑和六座主要桥梁。Phase 3 增加 11 个重点地标、轻量行吟阁及 22 个地点，支持点击、信息卡和两条浏览路线。处理过程、来源限制与验收记录见 [武汉 Phase 2](docs/wuhan-phase2.md) 和 [Phase 3 交付报告](docs/wuhan-phase3.md)。Cloudflare Pages 构建命令为 `npm run atlas:build`，产物目录为 `atlas-site/`；挂载于 `/city/` 时，深圳与武汉分别为 `/city/`、`/city/wuhan/`。

武汉 Phase 4 增加基于 OSM 节点拓扑的示意车流、长江/汉江船只、动态水面、夜景窗灯与桥梁/地标照明。数据面板可以统一暂停动态；支持实时 reduced-motion 和 high/medium/low 档位。完整说明见 [Phase 4 报告](docs/wuhan-phase4.md)。

Phase 5 增加武汉第三人称骑行：在当前浏览位置附近进入，使用 WASD / 方向键自由控制粉色电动踏板车，Space 刹车，拖动观察，Esc 恢复原视角。移动端提供转向、加速、倒车和刹车按钮；城市动态与昼夜切换继续运行。人物与车辆为原创程序化模型，不含外部 GLB。骑行用于虚拟城市探索，不是现实通行导航。实现、数据边界和验收见 [Phase 5 报告](docs/wuhan-phase5.md)。

Phase 6 将武汉道路顶面统一为渲染和骑行共用的三角形数据，补齐真实节点路口与桥头过渡，加入基于 OSM 绿地区域的树木、灌木和花簇。武汉电动车最高速度为 60 km/h，并更新发型、车辆细节、相机和碰撞采样；深圳保持原样。数据边界、27 项验收报告与复现命令见 [Phase 6 报告](docs/wuhan-phase6.md)。

Phase 6.1 修复桥梁支路接入、共享顶面、骑行预加载与驻留，植物全部改为仅视觉（骑行和相机均可穿过），并加入本地碰撞诊断。六桥双向 25/60 km/h 的 24 个浏览器案例、九区域自由探索及源数据限制见 [Phase 6.1 报告](docs/wuhan-phase61.md)。

```powershell
npm run wuhan:bridge-runtime:verify
npm run wuhan:collision:verify
npm run wuhan:airwall:verify
npm run wuhan:phase61:browser
npm run wuhan:explore:browser
```

完整浏览器实骑需要本机 Chrome 和 Playwright。分桥运行可设置 `BRIDGE`、`WUHAN_QA_PORT`、`WUHAN_QA_REPORT`，再运行 `npm run wuhan:phase61:browser-report` 汇总 24 例；局部开发复测支持 `--dev` 和 `WUHAN_QA_RESUME=1`。诊断叠加层在 localhost 使用 `window.__wuhan.rideCollisionDebug(true)`。

```powershell
npm run wuhan:ride:verify
npm run wuhan:ride:browser
```

```powershell
npm run wuhan:traffic:verify
npm run wuhan:vessels:verify
npm run wuhan:dynamics:browser
npm run wuhan:browser
```

离线重建动态数据使用已锁定的原始 OSM 缓存：先运行 `node tools/wuhan/export-dynamic-obstacles.mjs`，再在已安装 `tools/wuhan/requirements.txt` 的 Python 环境运行 `python tools/wuhan/build-dynamics.py` 和 `python tools/wuhan/verify-dynamic-geography.py`。Cloudflare 构建直接读取仓库 City Pack，不执行 GIS 生成器。

深圳基线验证：

```powershell
npm run verify
```

该命令会验证：`site/` 可从镜像重复生成、HTML 只有登记过的 noindex/声明变换、两个可读源码目录能逐字重组为正在运行的原始 chunk、门脚本保持零依赖。

运行版继续使用原始 hash chunk，避免改变 Three.js 场景的求值顺序。可读研究层位于 `src/readable/`；逆向坐标和引擎说明见 `docs/engine-notes.md`。

## 目录

- `site/`：完整、自包含的本地运行版本。
- `public-site/`：可部署的授权公开版；由脚本生成，不手工修改。
- `atlas-site/`：聚合预览；由 `atlas:build` 生成，不手工修改。
- `src/atlas/`、`src/cities/wuhan/`：独立地理运行时、武汉配置和来源锁定。
- `city-data/wuhan/generated/`：随仓库提供的武汉地形、水系、道路、建筑、桥梁及质量报告。
- `tools/wuhan/`：离线数据获取、GIS 生成、独立复核和浏览器检查。
- `public-overlay/`：公开版署名、隐私、部署头、404 和城市清单。
- `src/readable/`：按安全边界切开的可读研究视图；不直接由浏览器执行。
- `mirror/`：只读源站证据与抓包账本。
- `docs/`：chunk 图、引擎笔记和验收记录。
- `REBUILD_PLAN.md`：阶段、偏差、怪癖与版权风险登记。
- `DEPLOY.md`：发布事实、素材权利未知项和公开路径选择。
- `docs/city-pack-contract.md`：深圳与未来大理等真实城市包的扩展合同。

此项目仅用于私下研究。原站文案、音频、城市数据、视觉资产与品牌表达的权利归各自权利人所有。

### 武汉自由探索与城市音乐

当前产品规则：建筑是唯一硬碰撞实体，其余城市元素不阻断自由探索。音乐默认关闭，工具栏开启，数据面板调音量。详见 [自由探索与音乐](docs/wuhan-free-exploration.md)。

Ride 支持鼠标和触摸自由仰俯：上拖抬头，松手保持，按 R 平滑复位。详见 [相机操作与验收](docs/wuhan-ride-camera.md)。

新增验收：`npm run wuhan:free:verify`、`npm run wuhan:free:browser`、`npm run wuhan:music:browser`、`npm run wuhan:free:bridge-report`。
