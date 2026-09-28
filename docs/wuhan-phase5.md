# 武汉 Phase 5 · 第三人称骑行

本阶段在武汉 Atlas 的单场景、单渲染器、单主循环中加入自由骑行。主角为原创程序化成年女性与无品牌粉色电动踏板车。City Pack 保持 `842345da4d398de2`，地理数据仍为 Phase 4；运行时通过 `runtimePhase: 5` 标识此次功能升级。

## 1. 文件范围

新增 `src/atlas/ride/` 的 controller、motion、camera、avatar、animation、collision、spawn、CSS；新增 `src/atlas/adapters/terrain-index.js`，扩展 layered surface adapter。主循环、Traffic / Dynamics、武汉 HTML、构建器、package scripts、README 和验收脚本随之更新。构建器增加同版本 Three 的 `BufferGeometryUtils.js`，数据 bytes / SHA256 校验保留。

`public-overlay/ride/`、深圳源码、全部生成地理文件和 Cloudflare Pages 配置保持不变。验收截图保存在本地忽略目录 `probe/wuhan/phase5-*.png`；构建产物 `atlas-site/` 不提交。

## 2. 复用的深圳逻辑

先完整重读现有七个 Ride 文件、ride-mode 文档及两份验证脚本。移植有界加速与指数响应、高速减小转向、无原地转向、1/120 秒移动子步、实际接受距离驱动车轮、两段 IK、跟随相机、拖动回正、完整相机保存恢复和 AbortController 监听器生命周期。

## 3. 武汉适配

新建 `WuhanRideSurfaceAdapter`，没有复制深圳旧 `RideCollision`。武汉世界单位为 100 米，角色使用 `SCALE = 0.01`；最高速度 25 km/h、倒车 1.4 m/s、起步加速度上限 1.8 m/s²。运动保持自由转向，不依赖 Traffic lane graph。

## 4. 分层地表

每步保存 `surfaceId / layerId / kind / height / normal / rideAllowed`，按原有 referenceY、previousSurfaceId 规则查询。拒绝不可骑表面、过陡法线和超过 30 厘米的单步高差；前后和左右支撑查询保持同层。完整车体前、中、后三个圆及左右边界都检查地表、水边和障碍。

## 5. 高频地形采样

稳定碰撞网格的原始三角形进入 50 米格的 typed-array CSR 索引，查询直接做重心插值。没有栅格重采样，也没有读取可见 LOD。浏览器地形索引约 45.3 MB，首次进入后复用。水域使用边界空间格和边的 Z 行索引，保留原始轮廓、孔洞与点在多边形内的规则。道路按单段建立 50 米空间格，内部弯道接头选择最近线段连续支撑，整条道路两端按实际端面截止，避免将道路宽度变成桥外的虚构平台。

## 6. 普通建筑

按当前区域预取真实 building footprint，100 米空间 hash 做粗筛，圆与轮廓边界/孔洞做细筛，并检查高度区间。地标 replacement 建筑跳过；未完成加载的建筑区域暂时拒绝进入。远离当前区域的碰撞条目移除，解析后的已用 ArrayBuffer 从 pack 缓存释放。

## 7. 地标

直接使用 Phase 3 的组件 footprint、基础高程和高度。12 个地标均参与碰撞，校园、博物馆等多组件建筑分别处理，院落不会因为整片场地的巨大 AABB 被封住。不从视觉模型逐三角构建碰撞。

## 8. 桥梁

六座桥复用已发布的 pier / tower 元数据；旋转箱体检查不封死桥面。相机还检查桥面与下层板的厚度区间。结构位置与尺寸继续属于此前数据的估计，不据本次骑行修改桥梁模型。

## 9. 动态车辆

Traffic 在原有 20 Hz tick 后更新已接受车辆位置的空间 hash。Ride 只查询相邻格，检查逻辑与插值端点的车体矩形；车辆下一步也检查骑手，重生车辆不能覆盖骑手。骑手和车辆按实际高度区间排除上下层误碰撞。只停车或减速，没有撞毁、翻车或刚体引擎。

## 10. 出生点

依据当前 Orbit target 寻找约 600 米内道路，按距离和 cycleway、residential、tertiary、secondary、service 等优先级排序；过窄道路、motorway / trunk 及连接类、隧道、禁行道路、铁路不作为普通道路出生点。桥梁视角可选择安全的上层公路面。每个候选点均检查完整胶囊和附近交通。QA 出生点覆盖汉口、武昌、东湖、珞珈山、光谷、龟山、磨山与长江大桥，仅在 diagnostics 中提供。

## 11. 坡度与支撑

最大坡度为 26°。前后轮支撑决定 pitch，左右支撑决定 roll；小幅转弯倾斜受到限制。车体高度不会因插值低于轮胎支撑面。地形与水域没有被削平、改成陆地或替换为测试表面。

## 12. 长江大桥连续性

上层使用 `bridge-yangtze-first`；下层 `rail-yangtze-first` 保持 `rideAllowed=false`，江面也保持不可骑。离线测试逐段检查整个引道/主桥并实际越过另一端桥面边界到地面。起点为能容纳完整车体的引道内部；桥外西端接续的 trunk 保留不可骑属性，不通过放宽它来制造通过结果。

浏览器跨桥以普通油门和转向驱动相同控制器，采用测试专用 pure-pursuit 输入，留出车流侧向距离。测试按批次加速模拟时间，批次之间渲染和预取数据；没有写入骑手位置、固定轨道运动、关闭交通或关闭碰撞。报告明确区分这项自动实骑与截图视觉复核，没有将其描述成人工实时全程驾驶。

既有引道以中心线高程接入 DSM，外缘与地形仍可能存在超过 30 厘米的台阶，因此会被正确阻挡。跨桥验收在最后 100 米平滑靠回中心线后驶离桥面；没有扩大台阶容差或改动地形来掩盖边缘高差。

## 13. 相机

复用深圳的 6.4 米基础跟随距离、3.1 米高度和前方视线，按电动车坐姿与武汉单位调整 near plane。速度轻微增加距离和 FOV。相机从骑手胸部检查 boom，平滑前后都检查地表、轮廓、结构和桥面板；小汽车不会触发镜头缩短。退出恢复 position、quaternion、near、far、zoom、FOV、view offset、Orbit target 和 enabled。地点飞行先退出骑行。

## 14. 与城市动态共存

仅由 `main.js` 的现有 render 调用 `ride.update(dt)`；Ride 不创建 renderer、rAF 或 interval。骑行时 Orbit 不再更新相机，车辆、船、水面与光照仍更新。用户暂停城市动态时，Ride 仍可操作。

## 15. Touch

粗指针设备提供左右转向、加速、倒车、刹车按钮，支持同时按压与 pointer capture。桌面 WASD / 方向键、Space、拖动和 Esc 保留。实机手机 GPU 尚未测试，浏览器使用 390×844 触屏设备模拟。

## 16. 昼夜、减少动态与失焦

日光、夕照和夜景可以在骑行中切换。前灯白色 emissive、尾灯红色 emissive，制动时尾灯增强；没有新增 PointLight。reduced-motion 保留驾驶，关闭相机 swing、速度 FOV 和身体摆动，减少镜头滞后。blur、hidden、pagehide 清除按键和触屏状态并将速度归零。

## 17. 人物与电动车

以用户图片的粉色/奶白/灰黑配色、深棕中长发、粉色发夹、连帽外套、浅色日常下装、白鞋与小背包为方向，独立生成三维模型。成人头肩和四肢比例、坐姿、长坐垫、圆润车壳、小轮胎、双镜、圆灯与黑色底盘均在米制坐标中建模。固定细节按材质合批，转向、轮子、手臂保持独立。没有照片贴片、billboard、外部 GLB 或现实品牌标识。

## 18. 取消踩踏

电动踏板车没有自行车脚踏系统。本实现无 pedal phase、曲柄、循环腿部运动；两腿静态 IK 成形，双鞋位于踏板上方，臀部固定在坐垫，躯干仅围绕座位轻微俯仰。

## 19. 轮胎、车把与手

车轮角度仅累积碰撞接受的有符号三维 travel / 0.23 米轮胎半径。碰撞后结束本帧剩余移动子步，保持零速，拒绝运动不驱动车轮。倒车反向旋转。前轮和握把同属转向组件，双手用两段 IK 持续跟随 grip；脚的位置不受轮胎角度影响。

## 20. CPU

逐帧记录 `rideUpdateMs`、`surfaceQueries`、`surfaceQueryMs`、`staticObstacleQueryMs`、`dynamicQueryMs`、`cameraCollisionMs`。cameraCollisionMs 包含其内部的地表/障碍查询，不能与前述分类简单相加。最终数值由浏览器 QA JSON 和本报告验收表汇总。

## 21. 帧时间

目标为桌面 p95 ≤25ms。性能样本在真实渲染循环中采集，与加速跨桥模拟分开。软硬件环境为本机桌面 Chrome，允许 SwiftShader 兼容路径；不把桌面触屏模拟结果当作手机性能结论。

## 22. 验证与截图

离线 Ride 报告：`wuhan-phase5-ride-qa.json`；浏览器 Ride 报告：`wuhan-phase5-browser-qa.json`；原有地表、地点和动态回归另存 `wuhan-phase5-*-regression-qa.json`。Git LF checkout 报告为 `wuhan-phase5-checkout-qa.json`，检查实际 Git 导出文件而非只检查工作区。

视觉截图包括普通街道第三人称、汉口、武昌、东湖岸线、珞珈山、光谷、龟山、磨山、黄鹤楼、桥梁引道/中段/出口、夜景，以及角色前/侧/后近景。截图与本地调试产物不加入公开运行时。

最终命令结果和测量值见本报告末尾验收表。

资源循环检查对 Ride 的每个 geometry / material 对象身份作严格比较，并检查 DOM、监听器及 GC 后内存。报告同时保留全场景 geometry 数；城市分块仍按相机视锥异步加载、替换和回收，所以瞬时全场景计数不等同于 Ride 的资源数。HUD 速度和按钮标题直接更新已有 Text 节点，切换状态不替换节点。

## 23. 当前边界

DEM 为此前的约 30 米 DSM，包含树冠和建筑影响；道路、普通楼高、部分桥梁结构均继承既有估计。窄巷或贴近高墙时镜头会缩短。程序化角色是轻量实时简模，未引入外部精细人物资产。未进行实体手机或所有街道逐一试骑。这是虚拟城市探索，不是现实电动车导航或通行许可建议。到本阶段停止，不增加任务、竞速、积分、多人或历史模式。

## 最终验收记录

| 命令 | 结果 |
| --- | --- |
| `npm run verify` | PASS |
| `npm run public:verify` | PASS |
| `npm run wuhan:landmarks:verify` | PASS |
| `npm run wuhan:traffic:verify` | PASS |
| `npm run wuhan:vessels:verify` | PASS |
| `npm run wuhan:ride:verify` | PASS |
| `npm run wuhan:ride:browser` | PASS |
| `npm run wuhan:browser` | PASS |
| `npm run wuhan:dynamics:browser` | PASS |
| `npm run atlas:build` | PASS |
| `npm run atlas:verify` | PASS |
| `node tools/wuhan/browser-check-phase5.mjs --mobile-only` | PASS |

所有浏览器验收使用 `atlas-site` 构建，无源码代理。最后的触屏 CSS 布局调整另经重新构建和 `--mobile-only` 专项检查覆盖，桌面 Ride 逻辑未再变更。详细数据见 `wuhan-phase5-acceptance-qa.json` 及各 QA 报告。

- 桌面各镜头 p95 最大 **16.80 ms**。
- 各镜头逐帧平均测量范围（跨桥加速模拟不计入性能镜头）：

| 指标 | 最低 | 最高 |
| --- | ---: | ---: |
| surfaceQueries | 59.833 | 99.254 |
| surfaceQueryMs | 0.282 | 0.707 |
| staticObstacleQueryMs | 0.024 | 0.085 |
| dynamicQueryMs | 0.007 | 0.020 |
| cameraCollisionMs | 0.162 | 0.530 |
| rideUpdateMs | 0.604 | 1.081 |

跨桥累计行驶 **3912.8 米**，33145 个模拟帧，表面层依次为 `bridge-yangtze-first → ground`；阻挡统计 `{}`，最终驶离桥面到地面。

20 次进出后监听器 112 → 112，DOM 节点 362 → 362，角色几何 41、材质 17 个对象身份保持一致。强制 GC 后 JS heap 差值 -1379.1 KiB；没有持续资源增长迹象。

Git LF checkout 的 3630 个 City Pack 资产 bytes / SHA256 校验通过；深圳 32 个保留文件、144 个源码片段重组校验通过。未修改 Cloudflare 配置，构建命令仍为 `npm run atlas:build`，输出目录仍为 `atlas-site`。
