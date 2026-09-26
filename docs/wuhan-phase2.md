# 武汉 Phase 2：道路、城市体量与桥梁

本阶段在 Phase 1 City Pack 上增量开发；投影、核心/背景范围、垂直比例与深圳入口不变。数据与浏览器结果分别见同目录 `wuhan-phase2-data-qa.json`、`wuhan-phase2-geometry-qa.json`、`wuhan-phase2-browser-qa.json`。自动检查与人工截图复核不替代用户对 Phase 2 的最终视觉确认。

## 数据与可复现处理

道路和建筑使用 OSM 原始要素，没有随机补楼，也没有混入 Overture 建筑。公开 Overpass 镜像的分区快照底层时间并不统一：2026 年 5 月至 9 月；获取日为 2026-09-26。`urban-source-lock.json` 保存快照时间列表、原始文件 SHA256、长度、WGS84 坐标系、ODbL 许可。每个要素保留 OSM type/id、version、timestamp。跨瓦片重复元素取较新版本。这个数据集不应被称为“全城统一的 2026 年 9 月快照”。

原始数据与中间缓存留在被忽略的 `city-data/wuhan/raw/` 和 `intermediate/`。浏览器仅读取已发布 City Pack，不请求 Overpass。已有 Phase 1 的 DEM 和水系来源锁继续生效。所有发布 JSON 按 UTF-8 字节写入，以 LF 结束；每个资源登记长度、SHA256、encoding、schema 和 source。

处理顺序（依赖与 Phase 1 共用 `.tools/geo`）：

```powershell
$env:PYTHONPATH = "$PWD/.tools/geo"
$env:PYTHONIOENCODING = "utf-8"
python -S tools/wuhan/build.py
python -S tools/wuhan/build-foundation.py
# 已有 raw 快照时可跳过获取；镜像使用 Windows 系统证书链。
$env:WUHAN_CURL = "1"
$env:WUHAN_OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
python tools/wuhan/acquire-urban.py
python -S tools/wuhan/build-urban.py
python -S tools/wuhan/chunk-road-network.py
python tools/wuhan/acquire-landmarks.py
python -S tools/wuhan/landmark-replacements.py
python -S tools/wuhan/finalize-phase2.py
python -S tools/wuhan/verify-phase2.py
npm run verify
npm run public:verify
npm run atlas:build
npm run atlas:verify
npm run wuhan:browser
node tools/wuhan/verify-pack-bytes.mjs
```

不要仅运行 Phase 1 生成器后发布：它只生成地理底座，必须继续执行后续生成步骤。普通 Cloudflare 构建直接使用提交的 generated 文件，不运行 Python 或远程 GIS 查询。

## 水位与地形

长江、汉江属于已有网格中的同一连通水体。两者共用由内部 DSM 样本拟合的连续纵向坡面，汇入口没有独立平面拼接。固定下游方向为东北向，世界坐标 x 向东、z 向南，对应 `(0.6, -0.8)`，去掉 DSM 两端各 10% 异常样本后拟合坡降，并限制在 0.01–0.08 m/km。实际参数和样本数见 `quality.json`。它是低置信度的静态视觉估计，不是实时水情、水文测量或精确河道水动力模型。湖泊继续保持 Phase 1 的独立平面水位。

水域 x/z 轮廓、孔洞和完整地形三角拓扑不变。通过网格连通性更新河面顶点，岸线共享同一高程函数。水面校验保留湖面等高要求，同时检查河面函数、局部坡度和连续性。

显示层按约 5 km 空间块提供完整网格及 60/120/240 m 采样层级；近景读取完整 Phase 1 网格，保留四处山体真实细节。岸线与块边界都作为约束边，不跨岸线简化。两个复杂边界块在面积不一致时保留完整网格，不放宽验证标准。远景由一份合并粗网格快速建立，随后按距离异步升级，带阈值迟滞。

稳定地表查询仍使用完整 Phase 1 三角网，和可见 LOD 完全分离。道路与建筑离线采样同一网格；相机切换 LOD 不改变其高度。当前仍在首屏下载完整稳定网格，因此主要收益是绘制面数与渐进加载城市数据，不应宣称已经消除了约 21 MB 稳定地形下载成本。

## 普通建筑和道路

建筑优先使用 multipolygon relation，避免再次挤出成员 way；building part 从父轮廓扣除。真实 height 标签优先，其次 levels × 3.2 m（办公/商业 3.6 m），最后按用途使用低置信度默认层高。没有根据城区位置人为制造高楼圈。完整来源、估算标志、地标替换身份和基础高程保留在每块建筑 JSON 中。

建筑按真实 footprint 的边界及加密采样点确定基座；墙体底缘接到稳定地面，屋顶保持平面。原始高程是 DSM，树冠与建筑可能影响基座，不能描述为精确裸地基础。水面相交、无可靠地面支撑及异常高度候选被剔除并计数。近景和中远景的真实轮廓均离线合并为网格；每个空间块一次绘制，不是一栋楼一次 draw call。

道路保存原始节点关系以及 class/oneway/bridge/tunnel/layer/access/width/lanes。二维交叉不构成自动路口。地面道路中心与路带边缘采样稳定地表；隧道仅保留数据，不铺在地表。道路轮廓按四类颜色合批，避免导航地图式强调。地形无支撑的路段有明确缺口记录。

路网元数据按空间块发布，避免单个巨大 JSON；道路网格、桥梁、建筑块分别加载。地形先展示，随后道路和桥梁，再按视野与距离加载建筑；浏览器只解码、绘制和查询，不执行 GIS 修复、空间去重或高度推算。

## 六座桥及 Surface 合同

桥轴线来自 OSM 道路；引道仅沿已有道路连接延伸。桥面绝对高程使用河面净空估算和 DSM 端点约束，通过平滑曲线衔接引道；它不是 `layer × 1 m` 或逐点 `terrain + 常数`。已知桥型、主跨资料与估算字段分别记录在 `bridge-specs.json` 和生成的 `bridges.json`。

主跨使用轴线经过的最长连续河道水段；不把引道旁湖泊计入主跨。杨泗港、二七桥的这一问题在近景截图复核中被发现并修正，独立校验要求主跨至少 90% 采样点位于河道。

| 桥梁 | 主要轮廓 | 分层 |
|---|---|---|
| 武汉长江大桥 | 九跨钢桁架、连续桥墩、两端桥头堡基本体量 | 上层公路、下层双线铁路；铁路禁止 Ride |
| 鹦鹉洲长江大桥 | 橘红三塔悬索、两组主跨索线、吊索 | 独立桥面 |
| 杨泗港长江大桥 | 黄色双塔悬索、主缆与吊索 | 两层桥面分别登记 |
| 二七长江大桥 | 三塔斜拉、扇形索 | 独立桥面 |
| 晴川桥 | 红色双拱肋与吊杆 | 独立桥面 |
| 武汉长江二桥 | 双塔斜拉 | 独立桥面 |

有资料支持的尺寸为武汉长江大桥九跨 × 128 m、杨泗港主跨 1700 m、二七主跨 616 m，原文链接逐字段保存在 `bridge-specs.json.fieldSources`。其余主跨参数（鹦鹉洲 850 m、晴川 280 m、二桥 400 m）在本数据中仍标作估算，不能作为已核实尺寸引用。所有桥宽、桥面绝对标高、塔高、塔墩落点、引道纵断面、索垂度、拱高及上下层间距均是视觉估计。长江大桥九个可见跨按实际河道宽度布置，并不宣称模型每跨恰好 128 m。源 OSM 对二七和二桥的 suspension 标签与官方桥型资料冲突，覆盖为斜拉桥并保留覆盖记录。

所有 visual deck、surface 与 road profile 来自同一 XYZ 数组。墩、塔分别提供局部障碍几何信息，没有覆盖整座桥的巨大圆形碰撞体。墩底延伸到估计水位下的视觉封底，明确不代表真实河床测深。

`sampleSurface(x,z,referenceY,previousSurfaceId)` 使用空间索引，返回高度、法线、surfaceId、kind、layerId、traversable 和 rideAllowed。没有参考高度时保持地面/水面语义；给定参考高度时选择对应桥层。水上的桥不会把江面改成 land。只有合同与数据，没有迁移 RideController 或新增骑行、车辆功能。

## 验收与边界

### 文件变更

| 文件/目录 | 作用 |
|---|---|
| `src/atlas/render/urban.js`、`bridges.js` | 城市分块、六种桥梁结构、渐进加载及释放 |
| `src/atlas/render/geography.js`、`engine/load-pack.js` | 显示 LOD、稳定采样网格、延迟资源完整性检查 |
| `src/atlas/adapters/terrain-surface.js`、`geo/projection.js`、`main.js` | 分层 surface、河面高程、单循环集成与验收视角 |
| `src/cities/wuhan/index.html`、`bridge-specs.json`、`urban-source-lock.json`、`landmark-source-lock.json` | Phase 2 文案、桥梁证据和源数据锁 |
| `tools/wuhan/acquire-urban.py`、`acquire-landmarks.py` | 可缓存的真实 OSM 数据获取 |
| `tools/wuhan/phase2_common.py`、`build-foundation.py`、`build-urban.py` | LF 字节序列化、地形与水面、建筑和道路处理 |
| `tools/wuhan/chunk-road-network.py`、`landmark-replacements.py`、`finalize-phase2.py` | 路网分块、11 处替换轮廓、最终质量统计 |
| `tools/wuhan/verify-phase2.py`、`verify-surfaces.mjs`、`verify-pack-bytes.mjs`、`browser-check-phase2.mjs` | 独立几何、分层采样、检出字节、浏览器回归 |
| `scripts/build-atlas.mjs`、`verify-atlas.mjs` | Phase 2 注册状态、资源与 LOD 校验；保留原 hash 门禁 |
| `city-data/wuhan/generated/` | 可直接部署的数据包，全部登记 bytes/SHA256 |
| `docs/wuhan-phase2*.json`、本文件、`README.md`、`package.json`、`.gitignore` | 报告、运行入口及缓存忽略规则 |

### 建筑数量和五个样区

原始 OSM 标签计数：49,329 个 building、831 个 building:part；两种标签可能同属一个要素，不能简单相加当作建筑总数。裁剪、父体扣除、去重和支撑过滤后，发布 49,672 个体量，其中 building part 为 783 个。有 height 标签的 9,268 个（不是测绘认证高度），按 levels 推算的 5,584 个，用途默认估算的 34,820 个。

| 样区 | 体量 | height 标签 | levels 推算 | 默认估算 | 无 height 标签 | 局部重叠对 |
|---|---:|---:|---:|---:|---:|---:|
| 江汉关，半径 1.5 km | 467 | 12 | 14 | 441 | 97.43% | 0 |
| 汉口 CBD，半径 1.8 km | 243 | 11 | 97 | 135 | 95.47% | 0 |
| 武昌滨江，半径 2.2 km | 734 | 11 | 43 | 680 | 98.50% | 1 |
| 武大/珞珈山，半径 1.6 km | 1,693 | 15 | 95 | 1,583 | 99.11% | 24 |
| 光谷，半径 2.4 km | 2,762 | 323 | 168 | 2,271 | 88.31% | 5 |

这五区的水面相交和明显重复均为 0；覆盖率只说明现有 OSM 轮廓，不能估算真实缺楼比例。高楼标签复核清单保留江汉关样区 330 m、CBD 438 m、武昌 476 m 的源要素，未按区域补造其他高楼。全包仍有 192 对局部轮廓重叠，未把这些部分相交的真实源轮廓强行合并。11 处地标已有稳定替换 footprint：黄鹤楼、江汉关、绿地中心、武汉中心、晴川阁、龟山电视塔、武汉大学、湖北省博物馆、武汉站、马蹄莲、琴台大剧院；本轮仍是普通体量。

### 道路数量和分类

OSM 发布路段 51,046 条，含 bridge 标签 5,007 条、tunnel 标签 789 条；共有 1,002 条未生成地表道路网格（包括隧道和无可靠支撑的路段）。这是原始 way 路段计数，不是道路名称数或路口数。所有 class 和连接节点保留在 921 个路网块中，视觉合并为 583 个空间/分类网格。

| OSM 类别 | 路段数 | OSM 类别 | 路段数 |
|---|---:|---|---:|
| motorway / motorway_link | 1,299 / 1,178 | trunk / trunk_link | 1,189 / 1,455 |
| primary / primary_link | 2,311 / 980 | secondary / secondary_link | 2,762 / 493 |
| tertiary / tertiary_link | 3,450 / 166 | residential | 7,761 |
| service | 10,937 | unclassified | 4,264 |
| footway | 7,738 | path | 1,329 |
| pedestrian | 772 | cycleway | 710 |
| living_street | 488 | track | 414 |
| steps | 999 | corridor | 158 |
| busway | 77 | platform | 58 |
| road | 37 | services / rest_area | 20 / 1 |

浏览器 QA 的专用视角通过 `window.__wuhan.fly(id)` 调用：`confluence`、`guishan`、`jianghanguan`、`cbd`、`wuchang`、`luojia`、`guanggu`、`donghu`、`bridge-sequence`。普通用户六个原有区域按钮保持不变。截图位于 `probe/wuhan/phase2-*.png`。

数据统计、五个样区质量、桥梁净空/接头、资源哈希和帧时间以生成的 QA 报告为准。帧时间是在本机浏览器测得，手机测试为窄屏模拟，不代表真实手机 GPU 性能。geometry bytes 只统计去重后的几何缓冲，不等于整个浏览器进程内存。

发布数据集 `d201b6fcbb349916` 含 3,621 个资源，加 manifest 共 306,303,373 bytes（约 306.30 MB / 292.11 MiB）。初始 foundation 资源加 manifest 为 28,357,402 bytes；这不含 Three.js、应用代码及后续异步城市块。最大单文件是 `terrain.bin`，21,123,881 bytes。完整稳定地形为 2,704,983 三角面；初始显示网格为 244,214 三角面，水面 60,688 三角面。构建目录、原始下载、GIS 环境、归一化缓存和截图不提交；浏览器实际使用的 generated 数据需要提交。

### 本机浏览器性能

2026-09-26，Windows / headless Chrome，桌面视口 1440 × 900。根路径首屏 ready 1,691 ms（应用内部初始化 1,568 ms），嵌套路径 1,632 ms。ready 表示地理底座可交互，不表示整座城市全部下载完毕；视角指标在飞行完成后再等待 5.5 秒采样，城市块继续按需加载。统计窗口为最近 180 帧，网络为本地 HTTP，不能直接当作公网加载速度。

| 视角 | draw calls | 总三角面 | 地形三角面 | 建筑三角面 | GPU geometry 数 | 几何缓冲 bytes | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| 两江三镇 | 261 | 2,032,569 | 100,912 | 244,462 | 288 | 132,781,860 | 18.1 |
| 全域俯瞰 | 559 | 3,408,856 | 222,522 | 416,013 | 559 | 204,240,780 | 18.1 |
| 汉口 CBD | 57 | 733,387 | 201,859 | 29,378 | 298 | 145,511,664 | 18.1 |
| 武昌滨江 | 61 | 757,854 | 253,215 | 50,469 | 294 | 146,070,564 | 18.1 |
| 东湖 | 129 | 1,068,950 | 110,340 | 135,900 | 261 | 127,351,776 | 18.1 |
| 移动视口模拟 | 157 | 1,319,703 | 48,509 | 113,064 | 162 | 89,968,200 | 18.1 |

总三角面还包含道路、水面与桥梁。GPU geometry 数含探索后尚未超时卸载的资源，几何缓冲不含完整 CPU 采样网格、JSON 对象、纹理或浏览器其他内存。逐视角完整记录见 `wuhan-phase2-browser-qa.json`。桌面观测值低于 25 ms 目标；尚未在实体手机上确认稳定 30 fps。

### 测试结果

| 检查 | 结果 |
|---|---|
| `npm run verify` | PASS：144 源码分片字节一致，页面壳和零依赖门禁通过 |
| `npm run public:verify` | PASS：挂载前缀、发布资源及现有深圳 Ride 回归 |
| `npm run atlas:build` | PASS：完整性校验保留，数据包可直接构建 |
| `npm run atlas:verify` | PASS：2,216 网格、LOD 面积、湖泊平面/河道坡面、32 个深圳 baseline 文件 |
| `python -S tools/wuhan/verify-phase2.py` | PASS：源/资源 hash，建筑轮廓、支撑、去重、水域，道路节点，六桥主跨与接头 |
| `node tools/wuhan/verify-surfaces.mjs` | PASS：水面与桥面共存、上下层选择、铁路禁止 Ride、边界、河面法线、稳定采样 |
| Git LF 实际检出 | PASS：3,621 个资源长度和 SHA256 一致，全部 generated JSON 为 LF |
| `npm run wuhan:browser` | PASS：22 条结果，16 个桌面验收视角、根/嵌套路径、移动视口、版本/hash/缺文件异常 |

四项 npm 命令也在 `.tools/wuhan-phase2-lf-checkout` 中重新执行并全部通过。该目录由 `git -c core.autocrlf=false checkout-index` 从已暂存内容建立，遵守仓库 `.gitattributes`，不是手工对工作区字符串替换换行。它验证的是 Git 检出字节；运行平台仍为 Windows，并未冒称已在 Linux 主机运行。`wuhan-phase2-checkout-qa.json` 记录了 `water.json`、`water-provenance.json`、`quality.json` 的实测长度及 SHA256。

独立几何检查得到水面相交 0、明显重复 0、无地面支撑 0。建筑与地表、道路与地表的误差仅用于检查网格内部一致性，不代表 DSM 的测绘误差。桥面引道端点最大接头误差小于 0.000005 m；六桥包含引道跨越小湖的最低下层净空约 10.48–35 m，这些仍是估计值。

浏览器检查确认 renderer = 1、待执行主 rAF = 1、四座山体仍有真实起伏、江面不可通行、桥面可按参考高度选择、根/嵌套路径无丢失资源、切换/拖动/缩放/数据面板/销毁正常。人工复核了 CBD、珞珈山、六桥近景等截图，修正了 QA 视角未切换及引道湖泊干扰主跨的问题。深圳的源码和发布 baseline 均保持一致。未修改 Cloudflare 配置。

尚未开始 Phase 3。后续必须先由用户视觉确认，再按 replacement footprint 接入黄鹤楼、江汉关等精模；还应针对 OSM 缺失区和低置信度高度补充可靠来源，并复核桥面绝对标高与裸地基座。地标卡、车辆、船只、夜景深化、历史武汉和完整 Ride 均不在本轮。
