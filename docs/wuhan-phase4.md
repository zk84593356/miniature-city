# 武汉 Phase 4：动态城市、江面与夜景

基线为 `aadd2ea6db91a6c5df5a335c2a8961c542327573`，最终 City Pack 为 `842345da4d398de2`。本阶段只增加 Traffic、Vessels、Dynamic water、Night、少量鸟类及动态性能控制。Cloudflare 仍使用 `npm run atlas:build` → `atlas-site`。深圳运行资产和武汉 Phase 3 的 3,626 个数据资源保持逐字节不变。

## 1. 修改与新增文件

- 新增 `src/atlas/simulation/{path,traffic,vessels,dynamics,atmosphere}.js`，`src/atlas/render/{vehicles,vessel-models,dynamic-water,night-lighting}.js`。
- 修改 `src/atlas/main.js`、`render/urban.js`、`render/landmark-models.js`、武汉 HTML/CSS：接入现有主循环，暴露已有材质，增加夜景与数据面板中的动态开关。
- 新增 `city-data/wuhan/generated/{traffic-network,vessel-routes,water-style,dynamic-config}.json`，更新 manifest。没有改动旧地形、水系、道路、建筑、桥梁、地标或 surface 数据。
- 新增 `tools/wuhan/{build-dynamics.py,export-dynamic-obstacles.mjs,verify-dynamic-geography.py,verify-dynamics.mjs,verify-traffic-collisions.mjs,verify-vessels.mjs,browser-check-phase4.mjs}`。既有浏览器回归接受后续阶段，单独保存 Phase 4 回归报告。
- 修改 package scripts、城市注册展示状态及 README；新增本报告、深圳交通研究笔记和 Phase 4 QA JSON。原始缓存、依赖、截图和构建产物不提交。

## 2. Traffic architecture

先阅读深圳 traffic 的 lane 累积距离、缓存 itinerary、following、junction reservation、近景实例与远景点实现，研究记录见 [traffic research](wuhan-phase4-traffic-research.md)。武汉使用独立的轻量等价核心，不导入深圳 bundle。原始 OSM 拓扑 → 离线候选图 → 安全检查 → 缓存路线子图 → 20 Hz 模拟 → 主 rAF 插值渲染。全页仍只有一个 renderer、一个主 rAF。

## 3. Lane 数量

发布子图包含 **6,298 条代表车道**。候选安全图为 46,323 条代表车道。每个方向选择一条展示车道，不宣称完整重建每条道路的全部车道。原始 lanes、方向车道数、estimatedLaneCount 与 representativeLane 标记均保留。多车道不模拟变道。

## 4. Junction 数量

发布子图有 **5,168 个节点型 junction**、**5,558 个方向连接**。连接只来自相同原始 OSM node；不同 layer 只有在原始道路端点且高度连续时才允许连接。没有按二维交叉或距离吸附创建路口。

## 5. 可行驶道路数量

51,046 条原始道路中，15,260 条进入准入候选；安全候选图涉及 14,940 条道路。最终发布路线实际使用 **2,740 条道路**。排除步道、自行车道、受限 access、窄路、特殊 service、条件/专用车道信息复杂的道路、缺失剖面、单车道双向及下层桥面；车辆包络与水域/建筑冲突的车道继续剔除。机动车单向覆盖普通 one-way、反向 one-way、机动车覆盖标签及高速/环岛隐含方向。公交、货车还遵循车型准入；不支持的路线退回小客车。

## 6. 总逻辑车辆容量

固定对象池上限 **1,200 辆**，正常日间 high 目标 1,020 辆。池中有轿车、SUV、公交和少量货车；不可在路口或重叠位置强行生成。六座主要桥梁有专门的合法初始分布，继续沿缓存 itinerary 行驶。长江大桥只使用上层公路，铁路层没有车辆。

## 7. 各 quality tier 车辆数量

| Tier | 容量／夕照 | 日光目标 | 夜景目标 | 近景实例上限 | 船只 | 鸟类上限 |
|---|---:|---:|---:|---:|---:|---:|
| high | 1,200 | 1,020 | 540 | 400 | 18 | 12 |
| medium | 800 | 680 | 360 | 250 | 12 | 6 |
| low | 400 | 340 | 180 | 120 | 6 | 0 |

实际活跃数可短暂低于目标，等待安全生成空间。当前没有实时交通或人口流量输入。

## 8. Vehicle LOD

近景车身、车窗、白色前灯和红色尾灯各一个 InstancedMesh；颜色来自克制的固定配色。38 world units 内优先用实例，上限按 tier；其余可见车辆使用一个 Points 批次，220 units 外不画远景点，极远/视锥外剔除。最多 5 个车辆 draw calls，无每车 Mesh/Material/PointLight。

## 9. Intersection 与 following

20 Hz 固定步长，最多补 3 步；保存上一帧距离并插值。车道占用按弧长排序，限距与制动速度约束防止追尾；路口采用保守独占预约，并检查下游空间及车尾释放。世界空间近邻保护处理重复 OSM 线与短连接，最后以定向车体矩形检查当前与候选位置，跨车道交汇时也不能直接移动到另一车体内。这道约束不创建任何新道路连接。离线保存 **900 条 itinerary**，运行时不执行 Dijkstra。保守选择近似直行连接，不冒充完整的转向限制与信号配时模型。

## 10. 船只类别

程序化小型江船（12 × 3 m）、客船（28 × 7 m）、少量货船（42 × 9 m）。共享简化船体、上层舱、驾驶舱/货舱和灯光批次；没有 GLB、实时 AIS 或每船灯光对象。尺寸与速度属于视觉估计。

## 11. 航线数量

**3 条**：长江主通道、汉江通道、江汉关附近示意客船航线。high 配置为长江主通道 12 艘、汉江 3 艘、客船航线 3 艘。东湖不放船。

## 12. 航线来源与 estimated

端点为人工选定的示意位置；路径在现有河流水域内离线寻找、平滑并验证。记录 waterBodyId、path、direction、speed range、vessel types、source、estimated、bridge constraints、dockEndpoints。没有可靠码头资料，因此 dockEndpoints 为 null，不绘制虚构码头。全部航线是 estimated，明确禁止作为通航导航资料。

## 13. Bridge clearance

直接调用未改动的 Phase 2 `createBridge` 导出桥墩与桥塔 metadata；Node 检查导出结果逐项相等。航线使用最大船体包围圆加 6 m 双向偏移余量，完整 buffer 在水域内且不碰桥墩。六座桥均有过桥约束；净空按最低发布桥面扣除 2.4 m 结构余量，估计值约 **16.153–32.601 m**，船高上限 5.5 m。它是视觉安全估计，不是实测通航净空。

## 14. Wake

近景每船最多 8 段、全池最多 144 段透明低面数尾带，使用单个固定 BufferGeometry 和材质。沿近期航迹取样，长度有限、无粒子系统，45 units 外关闭。low、reduced-motion 关闭。暂停时尾带位置冻结。

## 15. Water shader

只增加水体风格 attribute 与标准材质 shader：两方向轻微 normal 波纹、Fresnel 感、太阳/月光高光、距离抗闪烁，以及昼夜水色。长江/汉江与湖泊使用不同波幅和时间速度。没有位移顶点、修改水位/岸线/碰撞；water.bin 和 water.json 的 SHA 保持不变。没有 SSR、额外 renderer 或反射 RenderTarget。

## 16. Night lighting

日光默认，保留夕照并增加夜景。夜景调整深蓝灰背景、雾色、半球光、月光方向光、曝光与水色；天空不纯黑，不使用 RGB 特效。标签、按钮、信息卡与页脚同步保持对比度。三个模式仅调整共享材质和 uniform。

## 17. Building windows

在已有普通建筑材质中生成世界坐标固定的窗格与稀疏亮灯模式，局部网格哈希决定暖/冷与密度。模式跨刷新稳定，不受时间随机数影响。并不声称知道真实楼宇用途或作息。只在立面发光，屋顶排除；远处降低细节避免闪烁。无单窗网格、灯对象或额外建筑 draw call。

## 18. Bridge lighting

六座桥的既有结构、拉索、桥面与桥墩共享发光材质参数：暖金、铜暖、金黄、冷白、暖橙、浅灰绿的克制区别。结构/索体亮度高于桥面/墩体。复用原几何，未改变桥面与障碍布局，也不创建 PointLight。

## 19. Landmark lighting

12 个地标沿用 Phase 3 几何。黄鹤楼等传统屋顶暖金，江汉关与建筑立面暖白，高层玻璃材质加入确定性窗灯；其余石材/屋顶按共享 palette 做低强度照明。没有新增大模型、RGB 动画或大批灯具。

## 20. Reduced-motion

实时监听系统偏好，冻结交通与水面时间，活跃车辆最多 150，船只减到 3，关闭尾流与鸟；水面保留很弱的静态法线。偏好在运行中变化也生效，相机飞行切换为立即到达。恢复偏好后继续现有对象池，不重建场景。

## 21. Quality tier 与后台控制

窄视口默认 low，桌面默认 high，可通过 `window.__wuhan.setQuality()` 设置 high/medium/low。tier 控制车/船/鸟数量、近景实例、尾流与窗格细节。动态开关位于数据面板。blur 暂停模拟，document.hidden 时主循环跳过昂贵更新；focus 后不追赶后台时间。诊断用 `getState().dynamics` 与 `getDynamics()`，普通界面不暴露开发面板。

## 22. Day / Sunset / Night 性能

最终完整浏览器指标见 `wuhan-phase4-browser-qa.json`；包括日光/夕照/夜景总览、地标、CBD、东湖、桥梁序列及六桥近景、嵌套部署和 390 × 844 模拟视口。记录 draw calls、triangles、estimated geometry bytes、p95 与动态计数。浏览器模拟视口不是实体手机测试。最终 **15 个 Phase 4 场景记录全部 PASS**，最差稳定 p95 为 16.8 ms。

| 场景 / 光照 | p95 ms | Draw calls | Triangles | 估计几何 MiB | 逻辑 / 可见车 | 可见船 | 动态 ms/frame |
|---|---:|---:|---:|---:|---:|---:|---:|
| confluence / day | 16.8 | 294 | 2,032,184 | 125.8 | 1017 / 401 | 15 | 3.95 |
| confluence / night | 16.8 | 335 | 2,090,166 | 129.2 | 540 / 207 | 14 | 2.57 |
| confluence / sunset | 16.8 | 334 | 2,089,998 | 129.2 | 1200 / 438 | 14 | 4.48 |
| wuhan-iconic / night | 16.8 | 270 | 1,821,811 | 166.2 | 538 / 147 | 5 | 2.30 |
| place-wuhan-center / night | 16.8 | 42 | 536,326 | 167.1 | 538 / 6 | 0 | 2.06 |
| campus-lake / day | 16.8 | 82 | 913,776 | 166.3 | 1018 / 19 | 0 | 3.66 |
| bridge-sequence / night | 16.8 | 434 | 2,584,006 | 170.2 | 540 / 210 | 14 | 2.04 |
| 手机模拟视口 / night | 16.8 | 176 | 1,323,353 | 103.5 | 180 / 31 | 1 | 0.76 |

## 23. Traffic CPU

Node 固定步长连续模拟 60 秒，验证全部六桥出现车辆、跟车间距、方向/拓扑和隧道状态；另有两条垂直路线的独占路口回归。`verify-traffic-collisions.mjs` 独立扫描 1,200 辆车的定向矩形包络，60 秒内以 4 Hz 检查同车道及跨车道重叠，最终为 0。实际浏览器按每帧记录 trafficSimulationMs；数值含无 tick 帧，因此与单次 Node tick 均值口径不同。浏览器 trafficSimulationMs 范围 0.57–3.25 ms/frame；Node 单次 20 Hz tick 平均 5.51 ms。完整数值见 simulation / browser QA。

## 24. Vessel CPU

最多 18 个固定对象，20 Hz 更新，简单空间间距保护；水面高度取同一 river-plane-v1 函数。Node 验证 120 秒水位连续，独立 GIS 验证完整船体包络，Node 复核运行时采样与原桥墩元数据。浏览器 vesselSimulationMs 范围 0.008–0.017 ms/frame。

## 25. 数据包增长与序列化

新增 4 个 JSON 合计 **9,594,476 bytes**（约 9.15 MiB，未含 manifest 增量），最大文件是交通网络，所有文件通过当前构建器的大小校验。数据保存路线，不保存车辆逐帧动画。所有 JSON 直接编码 UTF-8 后 write_bytes，固定 LF；manifest 记录 schema、source、estimated fields、最终 bytes/SHA。完整性校验保留。提交前还对实际 Git LF checkout 检验全部资源。

## 26. QA 与测试

验收命令：`npm run verify`、`npm run public:verify`、`npm run atlas:build`、`npm run atlas:verify`、`npm run wuhan:browser`、`npm run wuhan:landmarks:verify`、`npm run wuhan:traffic:verify`、`npm run wuhan:vessels:verify`、`npm run wuhan:dynamics:browser`。

独立 GIS 检查：`tools/wuhan/verify-dynamic-geography.py`；真实 Git checkout 检查：`tools/wuhan/verify-pack-bytes.mjs <checkout/generated>`。报告分别记录基础资源冻结、拓扑、车体/船体包络、桥高、模拟、昼夜/暂停/reduced/tier、内存稳定、旧地点/相机/桥面回归、深圳 baseline 和 LF/hash。**上述九项 npm 验收、独立 GIS 与真实 Git LF checkout 全部 PASS**。Phase 2 浏览器回归 22 cases；Phase 3 浏览器回归 19 个场景记录，并检查 12 模型、22 地点卡、实际拾取、两条浏览路线、相机净空、标签避让、嵌套路径及移动视口。Git checkout 对 3,630 个资源逐一验证，三个历史换行问题 JSON 均通过。

## 27. 当前限制

- 代表车道与保守直行路线是展示子图，不覆盖全部道路、车道、转向或真实信号配时；不支持变道和专用车道规则，相关复杂道路会排除。
- 密度、车型、窗灯、航速、航线、船型与净空均为演示估计。DSM 和既有桥梁结构误差沿用前阶段；没有实时交通、AIS、水位或照明资料。
- 路线端点处车辆池重新分配；船在端点短距离透明淡出后重用（船体几何和水位不缩放）。没有码头靠泊、完整地下隧道、专业船舶避碰或水动力学。
- 没有东湖船、音频、SSR/平面反射或大规模植被。仅少量近景鸟类。
- GPU geometry bytes 是应用侧估计，不等于驱动显存；模拟手机结果不能替代实体设备验证。
- 保守预约和车体包络保护可能带来局部排队；没有专业信号协调或死锁恢复。`initialLoadMs` 沿用既有基础场景就绪时点，所有性能采样另行等待动态与地标就绪，不代表全部异步分块已经驻留。

## 28. Phase 5 Ride 建议（未实施）

后续独立阶段可以复用既有 surface、bridge layer、导航高度网格及离线路网，先确定可骑行道路与机动车道路的区别，再单独评估 Ride 的控制、相机、角色和安全重生。Phase 4 没有导入 RideController/RideCamera/RideAvatar，没有骑行按钮、骑手、历史模式或任务系统。
