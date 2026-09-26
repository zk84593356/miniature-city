# 武汉地理底座 · Phase 0 / Phase 1 交付记录

当前交付是**可运行、可检查的现代武汉地理预览**。深圳基线、公开版和 Ride 维持原有行为。武汉尚无建筑、桥梁、道路、车辆、地标模型或骑行；没有历史切换。Phase 1 的严格误差与性能目标仍有部分未达标，列于文末，不能将此预览描述为全部验收通过的完整城市。

## 查看与构建

```powershell
npm ci
npm run atlas:build
npm run atlas:verify
npm run atlas:serve
```

- 武汉：<http://127.0.0.1:4175/wuhan/>
- 深圳：<http://127.0.0.1:4175/>
- 原公开版仍可独立 `npm run public:serve`，端口 4174。
- 聚合目录为 `atlas-site/`；不覆盖 `public-site/`。构建前检查数据 hash，构建后逐文件比对深圳子树，仅允许聚合 registry 增加武汉。默认城市仍为深圳。
- 六个观察视角、旋转／缩放／平移、日光／夕照、地名开关、三角网显示和点击高程查询均可用。手机上的区域栏可横向滑动。

## 数据事实

| 项目 | 实际使用 |
|---|---|
| 高程 | Copernicus DEM GLO-30，N30 E114 瓦片，约 30 m，WGS84 / EGM2008 |
| 高程性质 | DSM，包含树冠和建筑影响；不是裸地 DTM，不是实时测量 |
| 水系 | Overture 2026-09-23.0 water，5,325 个裁剪范围相交要素，逐项来源均为 OpenStreetMap |
| OSM 底层快照 | 要素 sources.version 为 2026-09-06；不能把 Overture 发布日误称为 OSM 更新日 |
| 获取方式 | Geofabrik / Overpass 连接不可用后，改用 Overture 官方 Azure 镜像匿名 Range 请求，仅读取相关 GeoParquet 行组 |
| 投影 | 局部等距近似，原点 114.32° E / 30.56° N，x 东、z 南，100 m / 世界单位 |
| 范围 | 核心 `[114.12,30.40,114.52,30.72]`；外围 `[114.02,30.30,114.65,30.83]`，属于研究裁剪范围，不是行政边界 |
| 垂直比例 | 1 倍；未通过夸张山体模拟真实地形 |
| 水域处理 | 保留面积 ≥3,000 m² 的源多边形，合并后 2,963 片连通水域、221 个孔洞；水面投影面积约 624.532 km² |
| 网格 | 陆地 1,385,109 顶点 / 2,704,983 三角面；水面 66,188 顶点 / 60,688 三角面 |

源文件的字节数和 SHA-256 已锁定在 `src/cities/wuhan/source-lock.json`。离线生成器会拒绝不一致的输入。逐水域来源（含 OSM 记录 ID）保存在 `water-provenance.json`。获取站点的月度发布目录会轮换，重处理时应保留本机 raw 快照；生成数据已随仓库提供，日常构建不依赖远程数据站。

来源：[Copernicus 开放数据](https://registry.opendata.aws/copernicus-dem/)、[Overture 2026-09-23 发布记录](https://docs.overturemaps.org/blog/2026/09/23/release-notes/)、[Overture Base 来源说明](https://docs.overturemaps.org/guides/base/)、[OpenStreetMap / ODbL](https://www.openstreetmap.org/copyright)。

## 几何与接口

DEM 双线性采样，无全域平滑、任意削峰或整体减高。背景与核心采用不同初始采样密度，四处山体窗口加密到 30 m；按重心误差最多六轮自适应细分。裁剪矩形边缘也按 60 m 采样，避免仅用四角高程形成错误边坡。

水面使用真实多边形及内环生成约束三角网；陆地网格由研究范围扣除水域后生成。投影拓扑统一到 1 cm 网格，岸线简化容差 3 m，删除不足 1 m² 的数值碎片，保留湖岛。共享岸线顶点先去重，避免接触内环导致三角化工具崩溃。

各连通水域水位取内域 DSM 中值，同一水体的岸线顶点与水面等高；这是岸线条件化处理，并非测得的当日水位。岸线附近高程会受此处理影响，误差统计明确排除距水岸 100 m 范围。水面没有地形覆盖；道路与桥梁尚未加入。

运行时固定 Three.js 0.185.0，与深圳包 revision 一致，但不导入深圳主包。武汉页面只有一个 renderer、一个画布和一个动画循环。静态网格按空间分块剔除，块间共享同一套顶点与法线；没有动态 LOD，因此不存在 LOD 切换缝隙，但也尚未实现 LOD 性能收益。

`terrain-surface.js` 从实际渲染三角形获取高度，并按水域多边形提供 `ground` / `water`。水面始终 `traversable:false`，范围外返回 null。这只是后续 Ride 的地表接口，不代表已迁移桥面分层、障碍物或武汉骑行模式。

数据通过相对路径加载，逐文件校验 SHA-256 后解压二进制；支持 AbortSignal。文件缺失、版本不兼容和内容损坏会显示明确错误与重试按钮，不能静默退化为平面。

## 已执行验证

- `npm run verify`：深圳 shell 可复现、144 个源码切片原哈希重拼、门脚本零外部依赖，全部通过。`.gitattributes` 固定 LF；基线源码的实际内容与 HEAD 相同，没有降低哈希门。
- `node scripts/verify-public.mjs`、`npm run verify:ride`：原公开版数据闭包与 Ride 运动／碰撞／相机测试通过。
- `npm run atlas:verify`：32 个深圳文件逐字保留，清单／文件 hash、网格索引、朝向、水面等高、湖岛和资源前缀检查通过。
- `node tools/wuhan/browser-check.mjs`：根路径与 `/nested/example/` 均通过，零页面异常、零缺资源、零逃逸前缀；区域飞行、拖动／缩放、光照、标签、线框、数据面板、销毁、390×844 手机布局及三类失败提示均通过。输出 `probe/wuhan/` 截图和 JSON 记录。
- `tools/wuhan/verify-geography.py`：源文件 hash 一致；投影陆水面积与报告一致；10 万个固定随机种子的三角形内采样点未发现陆地侵入水域。另生成四处山体东西向 2.4 km 剖面，每条 81 个点。

独立抽查结果（单位米；相对 DSM 的插值误差，非现实地面的绝对精度）：

| 范围 | p95 | 抽样最大值 |
|---|---:|---:|
| 全研究范围内域 | 1.240 | 7.382 |
| 核心区内域 | 0.913 | 4.245 |
| 龟山窗口 | 0.892 | 1.543 |
| 蛇山窗口 | 0.911 | 1.541 |
| 珞珈山窗口 | 0.890 | 1.480 |
| 磨山窗口 | 0.744 | 2.034 |

完整记录：`docs/wuhan-qa.json`、`docs/wuhan-profiles.csv`。生成器全量重心检查位于 `city-data/wuhan/generated/quality.json`，与独立随机抽查使用不同采样位置，最大值不能混为一谈。

最终浏览器记录保存在 `docs/wuhan-browser-qa.json`：本机两次本地场景初始化约 1.6–1.8 秒，预热后总览 p95 帧间隔均约 16.8 ms（各约 72–73 个样本）。这是有限的本机测试，不代表真实手机、冷网络或持续漫游的性能结论。

## 复现离线处理

普通预览无需 Python。需要重新生成数据时，使用 Python 3.12 与工作区内独立依赖，避免混入系统 Anaconda 的旧 NumPy / pandas。

```powershell
python -m pip install --target .tools/geo -r tools/wuhan/requirements.txt
$env:PYTHONPATH = "$PWD/.tools/geo"
$env:PYTHONIOENCODING = "utf-8"
python -S tools/wuhan/acquire.py
python -S tools/wuhan/acquire-water.py
python -S tools/wuhan/build.py
python -S tools/wuhan/verify-geography.py
npm run atlas:build
npm run atlas:verify
```

获取器默认保留并核对缓存；更新数据需显式更新 source-lock 并重新生成整个包。原始 DEM 与 GeoJSON 在被 Git 忽略的 `city-data/wuhan/raw/`。二进制内容为 gzip 压缩的 Float32 XYZ + Uint32 索引，压缩信息和解码长度登记在 manifest 中。生成器与浏览器检查置于 `tools/`，现有 `scripts/` 门保持零依赖。

浏览器回归需要 Playwright 和 Chrome。可通过 `PLAYWRIGHT_PATH`、`CHROME_PATH` 指定安装位置；默认使用本机 Codex bundled Playwright 和用户目录 Chrome，Windows 实测通过。

## 后续验收与优化

1. **误差门尚未完全满足**：原计划核心约 ≤2 m、背景约 ≤5 m 的严格最大误差目标仍有例外；不能用 p95 代替最大值宣布达标。重点山体抽查约 1.5–2.0 m，仍需结合岸线剖面和更高精度裸地数据审视树冠／楼群影响。
2. **资源预算尚未满足**：压缩后的地形约 21 MB，整个武汉数据包约 25 MB，超过原定争取首屏 ≤15 MB 的预算。当前会加载全包；需要后续按块渐进、LOD 或更紧凑的编码。总览可见约 148 万三角面、27 次绘制，近景会通过分块剔除减少。浏览器回归是本机功能证据，不等于移动设备 30 fps 或桌面 60 fps 验收。
3. 当前水面静态；流动、船只、反射与夜景属于后续氛围阶段。地表颜色表示高程，不代表实际植被类型。保留真实 DSM 的城区会呈现树冠与建筑造成的小起伏。
4. 标签是观察锚点，不是测绘控制点。龟山初始预设落入水域，已依据陆水数据与 DEM 山脊改为 `[114.275,30.558]`。行政区边界、POI 信息卡与地标模型不在本轮范围。
5. 未部署、未提交或推送 Git。应先审阅地理底座，再进入道路、建筑与桥梁阶段。
