# 武汉地理数据包

`generated/` 为可直接构建的地形水系预览数据。数据日期、投影、包 ID、压缩方式、文件大小及 SHA-256 见 `generated/manifest.json`。地形不是裸地测绘成果，水位不是实时水情；处理与误差限制见 [阶段记录](../../docs/wuhan-phase1.md)。

原始文件保留在 Git 忽略的 `raw/`。来源锁定在 `src/cities/wuhan/source-lock.json`，通过 `tools/wuhan/` 重新获取和处理。空间范围仅为研究范围，不是武汉市行政边界。

- 水系及其派生数据库来自 © OpenStreetMap contributors，经 Overture 2026-09-23.0 整理，以 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供。`water.json` 保留每个水域外环／内环及估计高程，坐标可依 manifest 的投影参数还原；`water-provenance.json` 保留逐要素 OSM ID、来源日期与许可信息。
- 高程来自 [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/)，适用该数据的免费使用许可和署名要求。© DLR e.V. 2010–2014 / © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.
- 浏览器中的着色、裁剪、简化和岸线条件化是本项目的处理，不是来源方对该可视化质量或实时性的背书。

不要把原站深圳资产的授权声明自动应用到这些第三方地理数据；各来源的许可独立保留。
