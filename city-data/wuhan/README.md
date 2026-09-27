# 武汉地理数据包

`generated/` 为可直接构建的地形水系预览数据。数据日期、投影、包 ID、压缩方式、文件大小及 SHA-256 见 `generated/manifest.json`。地形不是裸地测绘成果，水位不是实时水情；处理与误差限制见 [阶段记录](../../docs/wuhan-phase1.md)。

原始文件保留在 Git 忽略的 `raw/`。来源锁定在 `src/cities/wuhan/source-lock.json`，通过 `tools/wuhan/` 重新获取和处理。空间范围仅为研究范围，不是武汉市行政边界。

- 水系及其派生数据库来自 © OpenStreetMap contributors，经 Overture 2026-09-23.0 整理，以 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供。`water.json` 保留每个水域外环／内环及估计高程，坐标可依 manifest 的投影参数还原；`water-provenance.json` 保留逐要素 OSM ID、来源日期与许可信息。
- 高程来自 [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/)，适用该数据的免费使用许可和署名要求。© DLR e.V. 2010–2014 / © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.
- 浏览器中的着色、裁剪、简化和岸线条件化是本项目的处理，不是来源方对该可视化质量或实时性的背书。

不要把原站深圳资产的授权声明自动应用到这些第三方地理数据；各来源的许可独立保留。

## Phase 3 地标与地点

`landmarks.json` 保存 12 个模型定义、原始 OSM 身份、朝向、尺寸及估计字段；`places.json` 保存 22 个地点；`camera-presets.json` 保存镜头和手动浏览路线。`landmark-replacement-audit.json` 记录精确替换的 40 个普通建筑与 12 个受影响分块。其他地形、水系、道路、桥梁资源逐字节保留 Phase 2。

`camera-clearance.json` 是导航专用的保守高度网格，不改变 terrain / road / bridge / water 的 surface contract，也不是 Ride 碰撞实现。footprint 是 local world x/z，每单位 100 米；baseElevation / height / maxHeight 为米，bounds / position 为 world units。

资料与可重复生成方式见 [Phase 3 报告](../../docs/wuhan-phase3.md)。所有生成 JSON 均以 UTF-8 字节写入，固定 LF，并在最终 Git checkout 上验证 manifest bytes / SHA-256。

## Phase 4 动态数据

`traffic-network.json` 保存 OSM 机动车展示子图、原始节点出现序号、单向/车道/准入/层级信息、Phase 2 剖面衍生路线与 900 条缓存 itinerary。每方向只选择代表车道；缺失车道数、速度、偏移与模拟参数明确标为估计，不是完整导航网络或实时交通。

`vessel-routes.json` 保存三条估计航线、水域身份、速度/船型范围、复用的桥墩 metadata 及估计净空。航线不是 AIS 或实际航道；没有码头和东湖船。`water-style.json` 只给旧水网格附加视觉风格，不修改任何顶点、水位或 surface。`dynamic-config.json` 保存 20 Hz 模拟与三个资源档位。

Phase 3 的 3,626 个原有资源逐字节保留。四个新增 JSON、manifest 仍采用 UTF-8 LF 字节写入并保留构建时大小/SHA 校验。数据来源、估计范围、QA、性能与限制见 [Phase 4 报告](../../docs/wuhan-phase4.md)。
