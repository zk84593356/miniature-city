# 武汉 Phase 3：地标、地点与城市识别度

基线：`05f27f5ef7292ca86326664216ea088c19d1074a`。City Pack：`727ce7844d028d10`。本轮止于 Phase 3；未实现 Phase 4 动态城市或 Phase 5 Ride，未修改 Cloudflare Pages 配置。

## 1. 新增与修改文件

- 运行时：新增 `src/atlas/places.js`、`src/atlas/render/landmark-models.js`；增量修改 `src/atlas/main.js`。
- 武汉界面与资料：`src/cities/wuhan/index.html`、`wuhan.css`、`landmark-specs.json`、`place-anchor-sources.json`、`places-source-lock.json`。
- 生成数据：新增 `landmarks.json`、`places.json`、`camera-presets.json`、`camera-clearance.json`、`landmark-replacement-audit.json`；更新 manifest 和审计列出的 12 组建筑 JSON / 两级二进制网格。
- 工具：`acquire-places.py`、`build-landmarks.py`、`verify-phase3.py`、`verify-landmark-models.mjs`、`browser-check-phase3.mjs`；Phase 2 的浏览器及几何复核按阶段另存回归报告，几何检查接受审计中的正式替换，保留历史 Phase 2 报告。
- 构建：`package.json` 增加地标检查及串行浏览器回归；`scripts/build-atlas.mjs` 仅新增注册状态 `landmarks-preview`，保留全部完整性校验。
- 文档：本报告、数据/模型/浏览器/回归/checkout QA JSON、README 和数据包 README。原始缓存、截图、依赖与 `atlas-site/` 不提交。

## 2. 地标实现

| 地标 | 程序化实现 |
|---|---|
| 黄鹤楼 | 五层收分、暖色复檐、曲面飞檐、红柱、栏杆与台基；独立黄鹤楼比例 |
| 江汉关 | 历史白色主体、列柱与窗带、四面几何钟盘、独立钟楼尖顶 |
| 武汉绿地中心 | 三向圆角截面、收分塔身、现状顶部与合并竖梃 |
| 武汉中心 | 弧面转折、轻微扭转与斜切收束冠部；不同于绿地中心截面 |
| 晴川阁 | 横向展开的两层灰色重檐、柱廊与台基 |
| 龟山电视塔 | 渐变塔身、环形观景层、天线及简化色带 |
| 武汉大学 | 老图书馆八角上部与青绿重檐，加五座真实位置的历史建筑 |
| 湖北省博物馆 | 现状南北主馆及附属建筑，共 17 个组件，保留馆区位置与层级屋顶 |
| 武汉站 | 九组沿真实长轴排列的曲面翼状屋盖与玻璃站房 |
| 光谷马蹄莲 | 不对称展开花冠、花蕊主轴、五组叶片裙房曲面 |
| 琴台大剧院 | 九组展开琴键式屋面、局部舞台体量、玻璃基座与竖向构件 |
| 行吟阁（补充） | 轻量三层青瓦小阁，独立于黄鹤楼和晴川阁的比例 |

全部模型由项目代码生成 BufferGeometry，重复构件按共享材质合并。没有 GLB、照片贴片或运行时远程 CDN；材质统一使用 Landmark Material Palette。

## 3. 逐地标资料来源

| 地标 | 资料 | 日期记录 |
|---|---|---|
| 黄鹤楼 | [公开资料](https://zjt.hubei.gov.cn/bmdt/ztzl/hbcjda/gzdt_7471/201910/t20191028_79891.shtml) | 2006-02-09 |
| 江汉关 | [公开资料](https://www.dxh.gov.cn/YXLKG_16692/wszl/202508/P020250910558092916823.pdf) | 2025-08 |
| 武汉绿地中心 | [公开资料](https://www.skyscrapercenter.com/building/wuhan-greenland-center/33983) | 2026-09-26 |
| 武汉中心 | [公开资料](https://www.skyscraper.org/supertall/building/wuhan-center-tower/) | 2021-07 |
| 晴川阁 | [公开资料](https://www.wuhan.gov.cn/sy/whyw/202603/t20260310_2737325.shtml) | 2026-03-10 |
| 龟山电视塔 | [公开资料](https://www.wuhan.gov.cn/sy/whyw/202601/t20260131_2722823.shtml) | 2026-01-31 |
| 武汉大学 | [公开资料](https://news.whu.edu.cn/info/1017/46877.htm) | 2016-09-22 |
| 湖北省博物馆 | [公开资料](https://m-www.hbww.org.cn/p/9256.html) | 2023 |
| 武汉站 | [公开资料](https://www.arep.fr/app/uploads/2025/12/AREP_BOOK-INTERNATIONAL_VA_maj-2025_EXE_Web_Pap.pdf) | 2025-12 |
| 光谷马蹄莲 | [公开资料](https://www.wehdz.gov.cn/2022/ggxw_68627/ggxw_68629/202111/t20211117_1838809.shtml) | 2021-11-17 |
| 琴台大剧院 | [公开资料](https://www.600496.com/Business/detail/id/579/t/1) | 2026-09-26 |
| 东湖行吟阁 | [公开资料](https://www.wuhan.gov.cn/zjwh/whly/202303/t20230318_2171936.shtml) | 2023-03-18 |

来源日期是出版日期或本次访问日期；`checkedAt` 单独记录复核日期。OSM 位置身份、平面与推导朝向存入每个模型的 components / replacementFootprint / positionSource。武大老图书馆位于校园狮子山，没有移到珞珈山山顶；省博采用现状南北馆区。

## 4. 已发表高度与尺寸

| 地标 | 采用高度 m | 状态 |
|---|---:|---|
| 黄鹤楼 | 51.4 | 公开资料高度 |
| 江汉关 | 46.3 | 公开近似高度 |
| 武汉绿地中心 | 475.6 | 公开资料高度 |
| 武汉中心 | 438 | 公开资料高度 |
| 晴川阁 | 17.5 | 视觉/体量估计 |
| 龟山电视塔 | 221.2 | 公开资料高度 |
| 武汉大学 | 27 | 视觉/体量估计 |
| 湖北省博物馆 | 36 | 视觉/体量估计 |
| 武汉站 | 58 | 视觉/体量估计 |
| 光谷马蹄莲 | 128 | 公开资料高度 |
| 琴台大剧院 | 46 | 视觉/体量估计 |
| 东湖行吟阁 | 18 | 视觉/体量估计 |

没有本项目实测尺寸。绿地中心使用已建成高度 475.6 m；龟山电视塔使用塔身 221.2 m，没有把源标签的海拔值当建筑高度；马蹄莲采用已建成 128 m。OSM 平面是贡献者几何，不等同于官方测绘；朝向从最小旋转矩形推导。

## 5. Estimated 字段

全部模型 `estimated=true`：屋面曲线、立面比例、底座接地、构件尺寸和镜头均为简化表达；缺少可靠高度时另列 height。组件记录 DSM 周界采样中值、范围、OSM 身份和旋转。即使总高有资料支持，也不把屋顶或基底精度标成实测。

汉口江滩以“大舞台”作为浏览锚点。直接 OSM API / Overpass 连接失败，使用可核实的 [OSM 衍生页面](https://mapcarta.com/N10799812648) 的舍入坐标 114.29913, 30.588，在 `place-anchor-sources.json` 标为 secondary source / estimated / medium，没有伪造 OSM 响应。沙湖采用 OSM relation 7160933 原始几何。

## 6. Places 数量

共 **22** 个：11 个重点地标 + 行吟阁 + 6 座桥梁 + 磨山楚天台、汉口江滩、沙湖、东湖绿道。地点绑定统一 id、中文名、英文名、区域、简介、来源与 cameraPreset。简介为重新撰写的短文，无地点照片。

## 7. Replacement 结果

精确移除 **40** 个普通体量，保留 **49,632** 个普通体量。仅 12 个建筑分块变化；所有地标 replacement footprint 与水域重叠为 0。

| 地标 | 移除普通体量 | 定制组件 |
|---|---:|---:|
| 黄鹤楼 | 1 | 1 |
| 江汉关 | 1 | 1 |
| 武汉绿地中心 | 1 | 1 |
| 武汉中心 | 1 | 1 |
| 晴川阁 | 1 | 1 |
| 龟山电视塔 | 2 | 1 |
| 武汉大学 | 6 | 6 |
| 湖北省博物馆 | 18 | 17 |
| 武汉站 | 1 | 1 |
| 光谷马蹄莲 | 1 | 1 |
| 琴台大剧院 | 6 | 1 |
| 东湖行吟阁 | 1 | 1 |

规则：确切 OSM source identity，或大于 80% 被真实目标 footprint 覆盖的 building part。琴台使用原始完整父轮廓排除内部 part，没有按大半径删周边建筑。保留误匹配的黄鹤楼酒业、江汉关监督公署和武大新图书馆。

原 `landmark-replacements.json` 保留为 Phase 2 的候选计划；正式替换以 manifest.landmarks.replacementAudit 指向的审计为准。

**3,585** 个原有资源逐字节不变，包括 DEM 网格、Terrain LOD、水系、水位、道路、六桥与 surface 数据。投影、范围及 terrain exaggeration=1 不变。

## 8. 标签系统

保留城市、河湖、山体层，新增地标、桥梁和自然地点按钮。按距离、优先级、相机前后、屏幕边缘、标签重叠和 UI 区域决定显示。地标标签绑定三维包围盒上方。重点地标用原始 terrain、模型及普通建筑作遮挡检测；先对有限射线段作包围盒筛选，再检测三角形。静止结果缓存，移动或流式建筑变化后分批刷新，复用唯一主循环。

## 9. Picking 与信息卡

统一 raycaster：模型采用独立 AABB pick proxy；桥梁和自然地点采用小范围球形锚点。地形或建筑遮挡时拒绝穿透选择。标签和画布点击进入同一 place id / camera / card。信息卡包括双语名、类型、区域、简介、来源，可关闭和重新聚焦。浏览器回归使用真实 mouse click 验证画布和 DOM 标签两条路径。

## 10. Camera preset

新增 **24** 个正式 preset：22 个地点、龟蛇锁大江、武大—珞珈山—东湖全景。原六个区域按钮、两江三镇默认总览及桥梁序列保留，没有把地点全部加入区域栏。

飞行在原主 rAF 内分为上升、平移、下降，使用连续 easing。100 m 导航网格保守覆盖原始 terrain 三角形和普通建筑、地标 AABB；路径每 25 m 检查高度，低空手动操作保留净空。该网格只影响相机，不改地形或 surface。近楼镜头可能被保守网格适度抬高，这是安全取景取舍。

## 11. 东湖体验

“走近东湖”手动路线：绿地中心 → 武大 → 珞珈山 → 东湖 → 行吟阁 → 省博 → 东湖绿道 → 楚天台 → 磨山。支持前进/后退，没有自动定时轮播。“江城地标”连接总览、龟蛇、黄鹤楼、江汉关、CBD、滨江与桥梁。沿用真实岸线、岛屿和山体，只替换指定建筑，未人为清空湖岸建筑密度。

## 12. 模型预算

| 地标 | Triangles | Draw calls | Geometry KiB |
|---|---:|---:|---:|
| 黄鹤楼 | 7,632 | 6 | 298.7 |
| 江汉关 | 2,048 | 5 | 95.1 |
| 武汉绿地中心 | 13,184 | 3 | 565.1 |
| 武汉中心 | 11,304 | 3 | 484.7 |
| 晴川阁 | 1,760 | 5 | 65.8 |
| 龟山电视塔 | 748 | 6 | 31.9 |
| 武汉大学 | 4,728 | 4 | 177.0 |
| 湖北省博物馆 | 7,912 | 5 | 237.2 |
| 武汉站 | 5,748 | 4 | 232.0 |
| 光谷马蹄莲 | 9,236 | 5 | 327.2 |
| 琴台大剧院 | 3,492 | 4 | 155.0 |
| 东湖行吟阁 | 1,860 | 5 | 64.3 |

合计 **69,652 triangles / 55 draw calls**，约 **2.67 MiB** 几何缓冲。

实际视角有 frustum culling，显示调用数低于全模型合计。visual geometry、pick proxy 和 collision 元数据分离；没有迁移 RideController。footprint 使用 local world x/z，每单位 100 米；baseElevation / height / maxHeight 为米，bounds / position 为 world units。

## 13. 关键视角性能

测量环境：本机桌面 Chrome，1440×900；移动项目为 390×844 桌面模拟。p95 为流式加载与飞行结束后重置计数、采样 3.5 秒的稳定浏览帧间隔，另外保留切换后窗口 p95。不是实体手机测试。

| 视角 | 稳定 p95 ms | 切换窗口 p95 ms | 总 Draw calls | Geometry MiB |
|---|---:|---:|---:|---:|
| confluence | 16.8 | 16.8 | 283 | 124.5 |
| wuhan-iconic | 16.8 | 16.8 | 258 | 165.4 |
| place-yellow-crane | 16.8 | 16.8 | 40 | 168.5 |
| place-customs | 16.8 | 16.8 | 30 | 169.4 |
| place-wuhan-center | 16.8 | 16.8 | 34 | 132.5 |
| place-greenland | 16.8 | 16.8 | 38 | 103.7 |
| place-qingchuan-pavilion | 16.8 | 16.8 | 39 | 79.8 |
| place-guishan-tower | 16.8 | 16.8 | 50 | 77.4 |
| place-qintai-theater | 16.8 | 16.8 | 31 | 67.7 |
| place-wuhan-university | 16.8 | 16.8 | 25 | 89.7 |
| campus-lake | 16.8 | 16.8 | 76 | 95.4 |
| place-hubei-museum | 16.8 | 16.8 | 36 | 94.1 |
| place-moshan-chutian | 16.8 | 16.8 | 41 | 76.5 |
| place-wuhan-station | 16.8 | 16.8 | 44 | 80.0 |
| place-calla | 16.8 | 16.8 | 31 | 81.8 |
| place-xingyin | 16.8 | 16.8 | 28 | 98.2 |
| bridge-sequence | 16.8 | 16.8 | 276 | 174.1 |
| place-hubei-museum | 16.8 | 16.8 | 36 | 70.4 |
| mobile-emulated | 16.8 | 16.8 | 37 | 70.6 |

完整数据与场景统计见 [浏览器报告](wuhan-phase3-browser-qa.json)。截图在本地 `probe/wuhan/phase3-*.png`；该目录被 Git 忽略。

## 14. 测试与可重复生成

验收结果全部 **PASS**：`npm run verify`、`npm run public:verify`、`npm run atlas:build`、`npm run atlas:verify`、`npm run wuhan:browser`、`npm run wuhan:landmarks:verify`；独立地理检查 `python tools/wuhan/verify-phase3.py` 和原有几何回归 `python tools/wuhan/verify-phase2.py` 也通过。最终浏览器复核日期为 2026-09-27。

Phase 2 浏览器回归 22 项通过；Phase 3 记录 17 个桌面关键视角、1 个嵌套路径视角、1 个移动模拟视角，稳定 p95 最大 16.8 ms。几何回归确认 49,632 个普通建筑、51,046 条道路和六桥约束；无重复建筑、无建筑落水、无失去支撑的建筑。原数据中的 187 对局部普通建筑轮廓重叠仍按 Phase 2 规则保留。

浏览器检查桌面、390×844 模拟移动视口、嵌套路径、单 renderer / 主 rAF、销毁、点击、标签碰撞、22 张卡片、路线与相机净空。Phase 2 回归继续覆盖山体、水系、桥面分层、无效 schema、checksum、缺失文件和重试提示。构建逐文件证明 32 个深圳文件不变。

LF/hash：所有生成文本调用明确 UTF-8 `write_bytes`，manifest 按最终序列化字节计算大小及 SHA-256；最终从 Git index 以 LF checkout 到隔离目录，再运行 `verify-pack-bytes.mjs`。数据包 3,626 个资源全部校验，包括 water.json、water-provenance.json、quality.json。详见 `wuhan-phase3-checkout-qa.json`。

重新生成需要锁定的 Phase 2 提交、Python GIS 依赖及 `raw/urban-osm.json`、`raw/places-osm.json` 缓存：

```powershell
python tools/wuhan/acquire-places.py
python tools/wuhan/build-landmarks.py
python tools/wuhan/verify-phase3.py
npm run wuhan:landmarks:verify
npm run atlas:build
npm run atlas:verify
npm run wuhan:browser
```

生成器以固定 Phase 2 原件做增量，可重复运行。构建网站仅需 npm 依赖和已提交 generated/，不依赖 Python、raw 缓存或在线地图。原始来源锁定在 `places-source-lock.json`；造型资料在 `landmark-specs.json`。

## 15. 当前限制

- 模型是沙盘简模，非逐构件复刻；屋面与立面仍有视觉估计。
- DSM 含建筑和树冠，基底取周界中值，以有限裙边接地；没有削平山体或人为抬高地标。
- 普通 OSM 覆盖和高度完整性延续 Phase 2 的限制。
- 多建筑群以组 AABB 选择，空隙也可能属于选择范围；未来可细分 pick proxy，collision 元数据不依赖视觉网格。
- 标签遮挡分批刷新，移动期间允许短暂延迟。
- 汉口江滩锚点使用已注明的二级 OSM 衍生资料，不宣称官方测绘精度。
- 移动性能为桌面 Chrome 视口模拟，尚未验收实体手机稳定 30fps。
- 本地验收不等同于确认 Cloudflare 远端部署已完成。

## 16. Phase 4 建议（未实现）

先由用户确认核心镜头和模型轮廓，再单独规划有预算的交通、船只等动态系统；复用 City Pack 与 surface，维持单 renderer / 单主循环。优先安排实体手机 GPU 性能验收，Ride 留在 Phase 5。本轮未增加车辆、船只、鸟群、夜景重构、历史时间轴或 1938 切换。
