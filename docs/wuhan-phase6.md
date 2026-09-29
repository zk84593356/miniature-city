# 武汉 Phase 6：最终打磨与验收

日期：2026-09-29。基线：`41ed955b25192612cbd8c4912ce6eade9a226c2c`。City Pack：`6b9141e1a4d4368c`。

实现与本地验收完成。部署保持 `npm run atlas:build` → `atlas-site`；Cloudflare 配置未修改。以下区分运行时实测、几何审计和源数据限制，未开展 Phase 7。

## 1. 道路断裂根因

旧 `build-urban.py` 按每两个 profile 点生成独立矩形，各段没有共享转角横截面；中心线连通不等于路面闭合。矩形四角采地形再插值，也不等于原始地形三角平面，部分段因角点无地形支撑被整段丢弃。路口缺少真实节点连接面。桥梁旧 deck profile 与地面 DSM 横坡独立，地面可高于桥顶；桥墩按中心高度封顶会穿过有横坡的顶面。这些是几何及高程建模问题。

## 2. 两个红框

截图未附相机状态，通过两端桥门和龟山电视塔定位到保守区域，不能声称逐像素精确定位。固定地理回归记录在 [截图回归](wuhan-phase6-screenshot-regressions.json)：

| 红框 | 代表经纬度 | OSM road | canonical surface | 旧引道最大被 DSM 遮埋深度 |
| --- | --- | --- | --- | --- |
| 西侧 | 114.274472, 30.5567245 | osm-way-233478903 | bridge-yangtze-first | 22.38 m |
| 东侧 | 114.28967574, 30.54838676 | osm-way-28908192 | bridge-yangtze-first | 9.33 m |

两处主要是旧引道低于 DSM、与地面支撑不一致，并非增大碰撞容差能够修好。西侧 2,487、东侧 939 个中心/外侧足迹样本通过；西侧新顶面无遮埋，东侧网格插值最大差 6.82 cm，完整车身仍有连续支撑。这个数字是地形插值差，不是跨路面接缝台阶。

## 3. Road Surface 架构

新增 `tools/wuhan/build-road-surfaces.py`、`road-surfaces.json` 和 893 个 binary/metadata 分块。地面道路先构造有限 miter join 路带，再与不变的 terrain 原始三角形求交并做约束三角剖分；顶面为该平面 + 8 cm。不修改 OSM 中心线、道路节点、DEM 或水域。道路主体与路口合计 116,552 个 feature，另含六座主桥顶面定义。

## 4. Junction patch

按真实 OSM node 和兼容 layer 收集道路臂，使用有限道路宽度的连接多边形并贴合原始地形。生成 66,555 个节点连接面。二维相交但没有共享节点的高架/地面不合并；桥头真实连接节点另外生成局部过渡。

## 5. Chunk seam

完整 feature 先生成，再按中心归属分块。同一条道路不在两个瓦片中各造一个 cap。视觉和 CPU 注册同一份 Float32 顶点，分块加载、释放同步；地形共享边也来自原始三角形，不依赖近似 LOD。

## 6. Bridge transition

六桥保留原始路线，增加完整横截面采样、miter 转角、按实际连接道路渐变的宽度和 DSM 支撑包络。干地真实连接处匹配地形横坡，再渐变至主桥；7 个高架端点节点采用道路范围内的公共支撑面。所有估计过渡记录 `estimated` 与原因，不铺整片隐形平面。桥墩顶部取其覆盖范围内最低桥顶，桥塔/门楼移出可骑顶面边界，倾斜桥塔碰撞按真实构件分段。船舶障碍 metadata 同步，航线坐标未变。

## 7. Visual 与 Ride 统一

`createRoadSurfaces` 渲染的三角形就是 `createRoadTriangleIndex` 的输入。CPU 用重心坐标查询相同 Float32 顶面；地面道路存在时不再选中下面低 8 cm 的裸 terrain。交通车辆也查询此顶面并缓存当前三角形。开发主机可用 `window.__wuhan.roadDebug(true)` 和 `roadDebugProbe(x,z)` 查看网格、surfaceId、layerId、道路/节点归属；普通 UI 不增加调试项。

## 8. 旧版检测数量

重放旧独立矩形接缝构造，覆盖 29,311 条道路、9,969,586 个节点附近车身采样，记录 **133,604 个缺口样本，涉及 18,371 条道路**。另有 1,022,080 个小于等于 5 mm 的边界误差样本未计入物理缺口。这里统计的是缺口采样与受影响道路，不能当作 133,604 个独立孔洞。详见 [旧接缝审计](wuhan-phase6-legacy-joints-qa.json)。

## 9. 修复后的检测数量

[最终全城扫描](wuhan-phase6-road-continuity-qa.json)：32,072 条道路，104,847,561 个实际发布顶面采样，1 m 间隔，包含中心、左右轮线、四个车身角点。

- gapCount / heightSeamCount / missingSurfaceCount / waterLeakCount / layerMismatchCount：全部 0。
- 1 个 Float32 路面与 Float64 岸线接触点：距源边界 0.348 mm，小于该坐标两 ULP 的 6.104 mm；保留位置、精度与距离，不计作真实水面路段。
- 3,889,268 个包范围外样本、122,094 个原 OSM 道路与冻结水面冲突样本、1 个车身角落超出源道路宽度样本分开报告。没有把它们造为可骑水面，也没有据此声称全市每条小路都可通行。
- 本次前后两个审计采样口径不同，不将样本数简单相减作为“修复孔洞总数”。

## 10. 六桥 continuity

0.5 m 间隔的运行时完整车身检测，另测两侧各距边缘 1.2 m 的路径及真实高架连接节点。下表是中心及两外侧总样本数：

| 桥 | 采样数 | 顶面/层级失败 | 连接点失败 | 源建筑占用外缘样本 |
| --- | ---: | ---: | ---: | ---: |
| yangtze-first | 24,789 | 0 | 0 | 48 |
| yingwuzhou | 33,818 | 0 | 0 | 50 |
| yangsigang | 62,464 | 0 | 0 | 0 |
| erqi | 42,843 | 0 | 0 | 0 |
| qingchuan | 13,867 | 0 | 0 | 0 |
| yangtze-second | 49,090 | 0 | 0 | 0 |

已有真实建筑仍实体碰撞，前两座桥外缘的 48 / 50 个建筑占用样本明确保留，几何顶面单独验证；不表示可穿建筑直行。中心通行线无此问题。其余五桥为几何/碰撞回放，未冒充全部做过地面到地面的浏览器驾驶。详见 [六桥结果](wuhan-phase6-six-bridges-qa.json)。

## 11. 武汉长江大桥双向完整 Ride

[浏览器报告](wuhan-phase6-browser-qa.json) 使用普通 throttle/turn/brake 输入进行纯追踪转向，途中不写位置、不传送、车流保持运行：

- 西→东：4,194.576 m，14,893 个检查样本，最高 60 km/h。
- 东→西：4,194.274 m，14,904 个检查样本，最高 60 km/h。
- 都从实际地面道路出发，经引道和桥面，在真实共享节点转入对岸普通道路。
- 两方向均 0 blocked、0 recovery，只有 `ground-0` 与上层桥面，未进入 rail/water。
- 使用可见的外侧通行位置避开对向机动车；另由六桥足迹测试检查中心与两侧支撑。

城区长路线使用实际 adapter 在各档速度对应子步距离回放，包含真实建筑碰撞与完整 footprint；这项是几何回放，不称为浏览器自动驾驶：

| 区域 | 路线 | 长度 m | km/h | 结果 |
| --- | --- | ---: | --- | --- |
| hankou | 江滩大道 / osm-way-1056630005 | 3462.4 | 10 / 25 / 40 / 60 | PASS |
| wuchang | 民主路 / osm-way-455186807 | 1851.0 | 10 / 25 / 40 / 60 | PASS |
| donghu | 兴国南路 / osm-way-881448334 | 2086.6 | 10 / 25 / 40 / 60 | PASS |
| guanggu | 雄楚大道 / osm-way-652349139 | 2640.8 | 10 / 25 / 40 / 60 | PASS |

另完成汉阳龟山、武昌滨江、武汉大学、磨山等出生点、碰撞与视角回归。筛选长路线时被拒的候选及原因在 [长路线报告](wuhan-phase6-main-routes-qa.json) 中保留。

## 12. 60 km/h 参数

仅修改武汉：maxSpeed = 60/3.6 m/s；倒车 1.4 m/s；加速度上限 2.4 m/s²；制动 8 m/s²；滑行减速 `0.35 + 0.006v²` m/s²；方向响应基数 5.5。转角上限为 `0.5/(1+9·pace²)` rad，60 km/h 约 0.05 rad，低速能更灵活转向。15 s 加速测试达到限速，3 s 制动测试停稳。

## 13. 高速防穿透

每个碰撞子步同时受剩余帧时间、1/120 s 和 0.10 m 最大位移限制。上限使用当前速度加本步加速度余量，60 km/h 不会每次跨过数十厘米。每步核对中心、车体前后及两侧足迹、静态空间索引与动态交通查询。80 ms 粗输入帧下，10/25/40/60 四档对 2 cm 薄墙、倾斜塔体、树干圆柱、车辆占用范围的回归均停止且未越障；真实桥面车流另由浏览器验证。

`lastSafeState` 只在完整支撑、坡度和碰撞检查通过后更新；NaN、支撑消失或异常高度触发停止及恢复并记录原因/次数。普通被阻挡移动仅撤销本步，正常桥梁测试 recovery=0。没有提高既有 30 cm 层间阈值或将水改为可骑。

## 14. 高速相机

后随距离 6.4→7.5 m，lead 4.8→8.0 m，FOV 57→60°；竖屏增加距离/高度与 6° FOV。reduced-motion 关闭明显速度摆动与动态扩角。镜头只与实际结构、地形、桥板和树干碰撞，忽略柔软树冠；退出骑行精确恢复 Orbit、位置、四元数和投影。

## 15. 植物数量

**265,907 棵树、30,966 个灌木、28,631 簇花，共 325,504 个实例**；来源绿地多边形 3,752 个。它们分布在 City Pack 全域，当前可见数量由分块和 LOD 控制，非同时全部渲染。

## 16. 绿化来源

OpenStreetMap：park、garden、grass、forest、wood、scrub、tree、tree_row。离线 Overpass 提取 8,360 个要素，6,306,469 bytes；源快照 2026-07-15T15:22:01Z，获取时间 2026-09-28。SHA256 `47e7f1bafe0d5ac842f06f1f28ed141843695bc72e9a6edbfeb92fdd133bf73b`。来源、查询及 ODbL-1.0 署名保留在 [锁文件](../src/cities/wuhan/vegetation-source-lock.json)。浏览器不访问 Overpass。

## 17. Procedural estimated 范围

公园/森林等真实多边形内的位置和树排插值均为 deterministic estimated；仅明确 OSM 单树节点使用来源位置。品种、尺寸、植物比例、颜色和碰撞形状均为展示估计，不是实测树木清单。按 OSM ID 固定随机种子，排除道路、水面、桥面、建筑、地标、铁路和硬质广场。独立输出复核全部通过，最大贴地误差 0.00001242 m。详见 [植物验收](wuhan-phase6-vegetation-qa.json)。

## 18. Vegetation LOD

3 种真实 3D 树轮廓，加灌木和花簇，以 InstancedMesh 按分块/种类合批。近景完整形状，中景简化几何并取 1/3 实例；low 档中景 1/5、隐藏花簇并缩短远景距离。极远处隐藏，最多两块并发加载，离开视域 30 s 后释放。树干使用圆形 proxy + spatial hash，半径匹配树干模型，树冠不参与阻挡。

## 19. 发型

保持成年年轻女性比例。减薄头顶和后脑厚发块，分开肩部碎发、空气刘海、脸侧短发及半扎小马尾，保留粉色发夹。马尾和两组侧发共 3 个动态组，轻微响应速度、转向与制动，reduced-motion 时目标摆角归零；没有逐发丝或布料物理。

## 20. 电动车细节

原创程序化模型新增坐垫滚边、侧围饰条、防滑踏板条、支撑结构、转向灯、刹车盘与散热孔暗示；后视镜改薄并分镜框/镜面材质。保留圆形 LED 大灯、尾灯、前叉、弹簧、轮毂和胎纹，灯光通过 emissive，不增加 PointLight/实时镜面。脚保持踏板接触，双手继续 IK 抓握，车轮仅按 accepted travel 转动并周期 wrap。

## 21. 人物与车预算

合计 **51,724 triangles、56 draw calls、48 个独立 geometry、17 个 material**。正面/侧面/背面截图复核、脚不漂移、手柄接触与轮子停止回归通过。几何是轻量程序化风格，不等同于用户概念图的摄影级效果。

## 22. 植物预算及性能表

下面每行是该视角采样结束时的渲染统计；geometry MiB 是所驻留几何 TypedArray 估计量，不是进程或 GPU 总内存。Ride / surface 为每帧平均 CPU 耗时；p95 为帧间隔。Chrome headless + SwiftShader，本机实测，不代表所有 GPU/手机。

| 场景 | p95 ms | 总 draw calls | 总 triangles | geometry MiB | Ride ms | surface ms | 植物 draw calls | 可见树 | 植物 triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| overview-day | 16.8 | 538 | 1,912,894 | 129.3 | 0.000 | 0.000 | 0 | 0 | 0 |
| overview-night | 16.8 | 823 | 2,470,150 | 177.3 | 0.000 | 0.000 | 0 | 0 | 0 |
| iconic | 16.8 | 186 | 1,204,040 | 198.1 | 0.000 | 0.000 | 50 | 3,059 | 247,984 |
| cbd | 16.8 | 182 | 762,310 | 201.6 | 0.000 | 0.000 | 63 | 966 | 70,544 |
| donghu | 16.8 | 489 | 1,677,264 | 204.6 | 0.000 | 0.000 | 175 | 13,200 | 603,084 |
| ride-hankou | 16.8 | 374 | 1,150,827 | 219.3 | 0.785 | 0.307 | 181 | 5,096 | 407,770 |
| ride-luojia | 16.8 | 377 | 1,644,261 | 173.2 | 0.705 | 0.265 | 179 | 12,591 | 785,510 |
| ride-moshan | 16.8 | 335 | 1,821,341 | 154.4 | 0.642 | 0.278 | 180 | 23,876 | 1,394,266 |
| ride-60 | 16.8 | 510 | 1,628,726 | 150.0 | 0.912 | 0.433 | 208 | 11,697 | 536,048 |
| tree-stop | 16.8 | 433 | 1,240,433 | 145.5 | 0.657 | 0.267 | 207 | 7,414 | 525,228 |
| mobile-390x844 | 16.8 | 182 | 1,131,467 | 82.1 | 0.795 | 0.336 | 44 | 6,820 | 502,706 |
| mobile-844x390 | 16.8 | 274 | 1,485,956 | 92.7 | 0.803 | 0.335 | 96 | 10,060 | 636,768 |

## 23. Ride 60 km/h p95

16.8 ms；Ride 平均 0.912 ms、surface 0.433 ms。桥面车辆保持运行，无第二套 RAF 或 renderer。单场景 p95 不能当作冷加载或所有瞬时卡顿的上界。

## 24. Overview p95

日间/夜间总览稳定采样均约 16.8 ms。地标回归中的桥梁序列切换窗口曾测得 33.4 ms，稳定后 16.8 ms；流式冷切换仍可能超过 25 ms 目标，不隐去这项结果。

## 25. Mobile simulated p95

390×844 与 844×390、low 档均约 16.8 ms；按钮可用、无横向溢出，嵌套路径触控加速通过。**未测实体手机、温控或长时间电量表现**。

## 26. 全部测试及 Git 字节核验

以下 11 个要求的命令均通过：

| 命令 | 结果 |
| --- | --- |
| npm run verify | PASS；144 个原始片段精确重组 |
| npm run public:verify | PASS；深圳资源及骑行回归 |
| npm run atlas:build | PASS；仍输出 atlas-site |
| npm run atlas:verify | PASS；32 个深圳文件保留、3,109 个网格 |
| npm run wuhan:browser | PASS；Phase 2/3 图层、桥梁、地标、交互、移动端 |
| npm run wuhan:landmarks:verify | PASS；12 模型、完整 pack 校验 |
| npm run wuhan:traffic:verify | PASS；拓扑/60 s 模拟及独立 SAT，0 overlap |
| npm run wuhan:vessels:verify | PASS；3 路线、26,720 点、实际桥结构匹配 |
| npm run wuhan:dynamics:browser | PASS；昼夜、6 桥、暂停、画质、嵌套/移动端 |
| npm run wuhan:ride:verify | PASS；运动、IK、碰撞、层级、相机 |
| npm run wuhan:ride:browser | PASS；完整双向跨桥、生命周期、触控 |

新增全城道路、六桥、长路线四档速度、截图固定回归、植物、最终浏览器与 Git checkout 检查均通过。报告文件以 `wuhan-phase6-` 为前缀；Phase 5 历史报告保留。20 次进入/退出骑行前后：DOM 362→362，监听器 112→112，强制 GC 后 heap 增量 1,842,556 bytes，低于 3 MiB 门限，avatar 资源身份不变。

[Git checkout 校验](wuhan-phase6-checkout-qa.json) 使用真正 `git checkout-index` 输出已暂存内容，保留 `.gitattributes` 并设 `core.autocrlf=false`，验证全部 **5,918 个资源**的长度与 SHA256；所有 JSON 是 UTF-8 LF。以 Phase 5 基线核验 **3,629 个原有资源逐字节不变**，包括 terrain、water、roads、bridges、building 数据；vessel-routes 仅结构 metadata 更新。`scripts/build-atlas.mjs` 的完整性校验保留。

| 文件 | bytes | SHA256 |
| --- | ---: | --- |
| water.json | 1519877 | `b1873cabb35eaf3ffb4c3f91baab214d659e6b0d6becd8dc88c8b6bf32e74300` |
| water-provenance.json | 1192658 | `fd94ad6b7052b6144cdf1b400d28d4bea1206b456179a7895579b54d9dba5fd0` |
| quality.json | 2798 | `01317689c1e406d3ee344c8b5fca3590b0ae23bc7e1aa8a6a522fb0cb832e3fd` |

复现（使用 `tools/wuhan/requirements.txt` 对应 Python GIS 环境）：

```powershell
# 已锁定 raw 缓存可用时，完整重建新增地理层；不重新采集 DEM/水体。
python tools/wuhan/build-road-surfaces.py
python tools/wuhan/build-vegetation.py
python tools/wuhan/finalize-phase6.py
npm run atlas:build
npm run atlas:verify
npm run wuhan:road:verify
npm run wuhan:vegetation:verify
npm run wuhan:highspeed:verify
npm run wuhan:screenshots:verify
npm run wuhan:final:browser
# City Pack 已暂存后，检查实际 Git 字节；脚本不会自动 stage/commit。
npm run wuhan:checkout:verify
```

`raw/`、`.tools/`、`atlas-site/` 与截图 probe 都是本地缓存/构建产物，不提交。没有原始缓存时，重新获取会产生新源快照，必须审阅锁文件和重新生成，不能假设与本次快照相同。

## 27. 仍存在的问题与停止边界

- DSM 仍含建筑/树冠，不是道路实测裸地。桥头支撑包络、过渡坡度和结构布局是明确标注的展示估计，可能与实景工程断面不同；原始数据未被改写。
- 源道路与冻结水体冲突、范围外道路、极窄道路及建筑占用外缘均保留限制和坐标，不宣称全城任意路线通行。选定主路线、六桥顶面及双向长江大桥验收通过。
- 截图地理区域为保守定位，原始相机未知；固定代表点和范围可重复测试。
- 切换大量分块时有短暂帧时上升；未做实体手机、长时发热、电量或所有浏览器兼容性承诺。
- 植物是来源约束的展示分布，头像/车辆仍为轻量程序化模型。没有引入大型新玩法、天气、多人或新城市。

停止在 Phase 6。提交与远端推送结果由交付消息给出；该文档不将本地构建测试冒充 Cloudflare 线上部署验收。
