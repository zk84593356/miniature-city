# 武汉 Phase 6.1：桥梁实骑、Surface 连续性与空气墙修复

本次只修改武汉 Atlas、对应 canonical road surface 和验收工具。深圳、Cloudflare Pages 配置、DEM、水体、OSM 道路中心线及普通建筑源数据保持不变。City Pack 完整性校验继续启用。

## 1–2. 发现的问题及分类

| 桥梁 | 本轮确认的问题 | 分类与处理 |
| --- | --- | --- |
| 武汉长江大桥 | 既有主线通过不能覆盖所有支路接入；缓存路口的通行属性和实际地面路口选择可能不一致；原有常驻策略依赖相机 | C：刷新路口通行属性，显式记录真实 OSM 接入链；视觉、CPU 与骑行数据按骑手位置保留。未凭截图断言某个顶面三角形曾经缺失 |
| 鹦鹉洲 | 侧向引桥端点与主桥高度不一致，弯道内侧三角形坡度大于中心线坡度，估计桥墩进入接入道路，反向出口未及时选择侧桥 | A/B/C：修正共享的可见三角形、过渡多边形、岔口选择及可见桥墩位置 |
| 杨泗港 | 高架连接段端点和主桥不连续；引桥附近估计桥墩侵入道路；小夹角出口仍选主桥 | A/B/C：真实连接节点的高度接合、共享过渡面、方向选择及桥墩避让 |
| 二七 | 原接入段通行属性拒绝虚拟骑行，弯曲连接段按直线距离混合端点高度产生错误影响 | B/C：明确标记虚拟电动车通行走廊；改为沿道路里程混合端点高度 |
| 晴川 | 已测主线未复现几何阻断；仍受通用的相机卸载和植被碰撞策略影响 | Streaming/C：采用统一骑行驻留和植物穿行规则，并重新实骑四次 |
| 长江二桥 | 入桥处重合的两条地面道路导致错误 roadId 拒绝；相邻支桥端点和主桥切换不连续 | B/C：显式接入及过渡面；真实地面过渡多边形内部的连续同高地面道路都允许进入 |

A 表示可见几何，B 表示 CPU surface，C 表示通行策略或碰撞。几何调整同时作用于渲染和 CPU；没有铺设隐藏支撑面。开发阶段的失败记录保存在 `wuhan-phase61-observed-failures.json`，不将它冒充完整的原 main 分支对照实验。

## 3. 长江大桥截图区域的固定复现点

截图没有保存原始 rider/camera state。以下是根据大桥、龟山等地标定位的西侧引桥走廊固定点，不是对原像素位置的精确断言。每点检查九个车身 footprint 顶点、实际可见顶面、CPU 数组身份及碰撞规则。

| 固定点 | 经度 / 纬度 | world x / z | surfaceId / layerId | chunk |
| --- | --- | --- | --- | --- |
| approach-start | 114.26254170 / 30.55563570 | -55.0161911 / 4.8528869 | osm-way-50538708 / ground-0 | road-surface-47-50.bin |
| approach-middle | 114.26877602 / 30.55624688 | -49.0468439 / 4.1732848 | bridge-yangtze-first / bridge-yangtze-first | road-surface-48-50.bin |
| approach-transition | 114.27847995 / 30.55446631 | -39.7553499 / 6.1531947 | bridge-yangtze-first / bridge-yangtze-first | road-surface-48-50.bin |

开始点 roadId 为 `osm-way-50538708`。主桥 surface 包含 `osm-way-105437093`、`233478878`、`233478903`、`28908192`、`455183575`。完整字段见 `wuhan-phase61-yangtze-first-approach-regression.json`，回归标识为 `wuhan-phase6.1-yangtze-first-approach-regression`。

## 4–5. 根因与其他桥梁

长江大桥原先的测试只证明特定路径能够通过，不能证明所有桥外地面进入方式都正确。本轮排查发现通行属性缓存、重合 surface 选择，以及与相机耦合的驻留策略均能造成“看得见路面却不能进入”的 C 类问题。精确截图位置缺失，无法将用户那一次线上故障唯一归因于其中某一项。另五桥的具体发现列在上表；六桥都重新执行了完整地面到地面的浏览器骑行。

`ride-connections.json` 列明已有 OSM 道路与连接节点。过渡多边形限定在实际路口宽度；高架下方仍为空。高度修正、虚拟电动车通行和估计结构调整均带有 `estimated` / `reason`，不表示现实道路允许电动车通行。

## 6–7. 双向实骑与速度

| 桥梁 | 25 km/h A→B | 25 km/h B→A | 60 km/h A→B | 60 km/h B→A |
| --- | --- | --- | --- | --- |
| 武汉长江大桥 | PASS | PASS | PASS | PASS |
| 鹦鹉洲 | PASS | PASS | PASS | PASS |
| 杨泗港 | PASS | PASS | PASS | PASS |
| 二七 | PASS | PASS | PASS | PASS |
| 晴川 | PASS | PASS | PASS | PASS |
| 长江二桥 | PASS | PASS | PASS | PASS |

共 12 条方向路线、24 个速度案例。`wuhan-phase61-bridge-browser-qa.json` 校验每例：普通道路起点和终点、经过主桥、达到目标最高速度、surface/layer 序列及所有阻挡计数。详情保存在六个 `wuhan-phase61-browser-*.json`。

桥梁测试运行真实浏览器 RideController、交通和碰撞，通过加速输入步进及渲染/网络让步完成。弯道减速，遇实际车辆用正常油门、转向、制动或倒车避让；测试工具的局部路径搜索仅预测候选操作，不写入骑手位置。初始化后无 teleport、手动 prepare、交通暂停或碰撞关闭。它与下述真实墙钟自由探索分别统计。

## 8–10. Loading、恢复和缺失 surface

24 例最终记录中，`loadingBlockCount`、`recoveryCount`、`surfaceMissingCount`、`wrongLayerCount`、`waterTransitionCount` 全为 0。真实交通接触单独保留在 `blockCounts.traffic`，未删掉失败尝试来伪造零碰撞。

没有完整的修复前同条件全矩阵记录，因此不宣称“历史 loading/recovery 从某个数字降到 0”。开发复现记录包含真实拒绝原因，但不足以推断原线上发生频率。

## 11–12. 空气墙验收与成因

固定种子 61029，九区域各 112 点，共 1,008 个可站立、静态实体外的点，八方向共 8,064 次完整 footprint 检查：`airWallFalsePositiveCount = 0`。真实水边、坡度超限、桥面边缘和禁止面单独分类，详见 `wuhan-phase61-airwall-qa.json`。

真实浏览器键盘探索保留九区域 100 秒测试及蛇山追加复测，共 1,004.383 秒、约 5.55 km。加载阻挡、缺失 surface、恢复、不可见碰撞体均为 0。蛇山遇到有 ID 的禁止道路及桥缘，正常倒车转向后继续行驶；原失败接触仍保留。地区包括汉口、汉阳、武昌、东湖、武汉大学/珞珈山、光谷、龟山、蛇山和桥梁邻域，见 `wuhan-phase61-exploration-qa.json`。

已处理的空气墙成因：植被实体查询；建筑架空部分错误的底高；地面 roadId 不同被当作桥梁层级跳跃；相机卸载所需数据；岔口沿用错误的主桥支撑；桥墩占据已存在的接入道路。

## 13–15. 建筑、结构与 min_height

普通建筑保留真实多边形及孔洞碰撞；地标替换建筑不再保留旧 footprint。架空建筑的底部为 `foundationMeters + minHeightMeters`，与可见模型一致，骑手头顶低于底面时可通过。没有为了畅通而删除实体建筑。

桥塔、portal、桥墩等继续使用分段几何和匹配的 OBB。五个估计桥墩同时移动可见模型与 OBB：鹦鹉洲里程 1130→1050 m；杨泗港 680→710、9080→9050、9230→9210、9530→9510 m。桥梁中心线和地理源位置没有移动。这些是程序化结构布局估计，不是测绘桥墩坐标。

可见道路/建筑重叠审计共 3,971 个候选：2,623 个道路宽度边缘重叠，1,348 个中心线重叠待源数据复核。它们不是 3,971 个已确认错误，也没有统统取消碰撞。长江大桥边缘涉及 `way/1313792264`、`way/1313792265`，鹦鹉洲涉及 `way/1031530826`；晴川还记录四个边缘候选。源 ID、面积、位置和保留理由见 `wuhan-phase61-road-building-qa.json`（状态 AUDIT）。

## 16. Road ↔ Terrain

高度连续、完整 footprint 安全的普通 road/terrain 可以互相进入，不要求相同 roadId。30 cm step、26° 坡度、80 cm footprint 高差限制保持不变。不同高架层、水和铁路仍受限制。长江二桥的重合地面道路例外仅在真实 ground junction 三角形内、同高且连接到该引桥时生效；多边形外拒绝已单独测试。

## 17–19. 预取与 Bridge pin

道路视觉和 CPU 注册来自同一解码顶点及三角形；共享加载 Promise，卸载时同步注销。Ride 驻留按玩家位置、方向、速度计算，不以相机视锥作为唯一依据。

当前附近 400 m，沿前方增加随速度变化的预取窗口，60 km/h 时前瞻约 800 m。普通道路 canonical、建筑视觉与碰撞一起加载，`covered()` 安全机制继续保留。查询按空间格缓存候选 chunk，仅缓存空间关系，每次仍检查实时加载状态。

接近桥梁时 pin 主桥、两端接入链和端部邻域；完全离开后释放并按超时卸载。驻留测试把相机移到远处仍保留 CPU/视觉数组，释放后能卸载，见 `wuhan-phase61-residency-qa.json`。

## 20–21. 植被与相机

tree、trunk、shrub、flower 和 decorative greenery 全部仅作视觉。已删除 vegetation `blocked()`，骑行移动和相机都不查询植物碰撞。单元检查以“只要查询植物就抛错”的对象验证两个调用链，真实浏览器也验证穿过源数据树木。

## 22. 诊断接口

`getRideState()` / `rideBlockEvents()` 保存实际 movement rejection 的 reason、kind、id、source、bounds、position、distance、candidate surface、前后 surface/layer、法线与坡度。诊断 `rideProbe()` 不再覆盖最后一次实际拒绝。

`rideCollisionProbe()` 返回附近约 30 m 的实际静态/交通碰撞对象及上下界、距离和驻留状态；`rideSurfaceProbe()` 对照 terrain 与 canonical 候选；`rideResidency()` 列出驻留、pin 和 pending。本地 `rideCollisionDebug(true)` 绘制 footprint、实际建筑轮廓、桥结构、交通、道路三角形、水边与拒绝点，线上普通 UI 不显示该叠加层。

三个固定引桥点已执行本地浏览器静态检查，并保存普通/诊断截图。`wuhan:diagnostics:browser` 可复现，结果为 `wuhan-phase61-diagnostics-browser-qa.json`；此静态检查与完整桥梁实骑分别计数。

## 23. 性能

历史 Phase 6 与本次 headless Chrome / SwiftShader 对比：所列最终视图 p95 帧时间均约 16.8 ms；汉口 Ride update 0.785→0.691 ms、60 km/h 0.912→0.775 ms，移动竖屏 0.795→0.857 ms。该结果来自历史报告和本轮采样，不能当作隔离环境的严格 A/B 优化证明。20 次进出骑行后监听器、DOM、角色几何/材质稳定，GC 后堆增量约 2.50 MB，低于既有 3 MB 阈值。

动态 CPU 预算首次在大量浏览器并发时失败；降低并发后完整重跑通过，没有放宽预算。性能详情见 `wuhan-phase61-performance-qa.json`。未测试实体手机。

## 24. 验证命令与数据完整性

以下全部通过：`verify`、`public:verify`、`atlas:build`、`atlas:verify`、`wuhan:browser`、`wuhan:landmarks:verify`、`wuhan:traffic:verify`、`wuhan:vessels:verify`、`wuhan:dynamics:browser`、`wuhan:ride:verify`、`wuhan:ride:browser`、`wuhan:road:verify`、`wuhan:vegetation:verify`、`wuhan:highspeed:verify`、`wuhan:screenshots:verify`、`wuhan:final:browser`、`wuhan:checkout:verify`、`wuhan:bridge-runtime:verify`、`wuhan:airwall:verify`、`wuhan:collision:verify`、`wuhan:phase61:browser-report`。

`wuhan:phase61:browser` 的 24 例分桥运行后由 `wuhan:phase61:browser-report` 校验完整性；自由探索通过 `wuhan:explore:browser` 执行。GIS 验证使用锁定源缓存和本地 GIS 环境。旧回归脚本沿用既有 Phase 6 报告文件名，其历史版本仍保留在 Git 中。

道路检查覆盖 32,086 条道路、104,867,014 个样本：gap、height seam、missing surface、water leak、layer mismatch 均为 0。未支持的源数据水面道路等发现仍单独列出，没有伪造通行面。

真实 `git checkout-index` LF checkout 校验全部 5,918 个资产的 bytes/SHA256；3,629 个 Phase 1–5 资产哈希不变，船舶路线仅更新匹配可见桥墩的结构 metadata。water、water-provenance、quality 的精确 checkout 字节记录见 `wuhan-phase6-checkout-qa.json`。部署仍执行 `npm run atlas:build`，输出 `atlas-site`，未修改 Cloudflare 配置或移除 hash 校验。

再次使用 `build-road-surfaces.py --reuse-ground` 重建桥梁/接入面及结构 metadata 后，全部 dataFiles 记录和 manifest 字节均完全相同；复用的地面三角形已通过独立全量检查，见 `wuhan-phase61-reproducibility-qa.json`。没有将复用缓存的检查写成从原始数据完整冷启动重建。

## 25. 仍存在的限制

截图的精确原始相机/骑手坐标不可恢复；已交付可重复的对应走廊固定点。桥梁和接入高度、桥墩布局仍包含明确标记的模型估计。OSM 建筑与道路的候选重叠保留供后续源数据复核，真实建筑、陡坡、水岸和禁止道路仍会阻挡。交通拥堵可能需要减速或倒车，不保证任何方向始终无车。

本次验证本地构建与 Git checkout，不将其写成 Cloudflare 线上部署成功。远端提交/推送结果由交付消息给出。
