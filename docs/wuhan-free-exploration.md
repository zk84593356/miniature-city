# 武汉 Ride：自由探索与城市音乐

2026-10-04 验收。产品规则调整覆盖此前 Phase 5 / 6 / 6.1 的冲突规则：

**建筑是唯一硬碰撞实体；其余城市元素以视觉和 Surface 表现为主，不阻断自由探索。**

## 骑行与建筑

普通建筑及正式 Landmark 建筑主体保留碰撞。普通建筑使用源多边形及孔洞，架空层底部采用与可见建筑相同的 `foundationMeters + minHeightMeters`。地标替换掉的旧建筑不再生成阻挡；尚未显示的普通建筑不作为不可见碰撞体。地标额外从实际可见模型的三角形提取车身高度处的截面，源轮廓内但模型外的空地允许通过；Debug 也绘制实际截面。龟山电视塔的宽源轮廓边缘、架空模型及重叠实体均有专门回归。地标和普通建筑的拒绝统一为 `blockKind=building`，附建筑 ID、来源、轮廓、上下界及位置。

植物、车辆、桥墩、桥塔、桥门、栏杆、水岸、道路边缘、坡度和层级切换都不再触发 movement reject。Traffic 车辆间的跟车和防重叠保留，玩家不再参与 Traffic 的停车或生成避让。诊断和 Debug 只把建筑标为阻挡体；水面和道路三角形属于支撑面。

地图内部的正常拒绝只来自建筑；`dataset-end` 和 `fatal-invalid-state` 为边界/数值异常保护。恢复不再由水、坡、车辆、植物或桥结构触发。最高速度仍为 60 km/h，运动仍以最长 10 cm 的 substep 校验建筑，视觉 pitch/roll 保留限幅。

## Surface 与六桥

Surface 负责高度和姿态。源道路的 access 标签不再限制虚拟探索，不改写 City Pack 的源属性。没有道路/桥面时，水域使用可见水面的实际高度，陆地使用稳定 DEM 三角形，避免进入河床。没有邻近道路的山地或开阔水域，也能在视图附近选择无建筑的入口。

仍优先保持连续的当前桥面；选层使用高度、原 surface 和接入方向，而非用 layer mismatch 拒绝移动。六桥原有 canonical 顶面、共享 positions/indices、真实接入多边形和预加载保持。骑手周围及前方的道路、建筑独立驻留，接近桥梁时 pin 主桥及两端连接，驶离后释放。没有增设隐藏支撑平面，也没有修改 DEM、水体、桥位或建筑源数据。

## 原创城市音乐

新增工具栏“♪ 音乐”按钮；数据面板内有开关及 0–100% 音量。首次访问关闭，默认音量 35%。浏览器只在可信用户交互后创建/恢复 AudioContext，保存的开启偏好也要等待新的交互。

音乐由项目本地的 Web Audio 合成器生成：柔和加法合成钢琴、温暖 Pad、低音及轻节拍，无人声、录音采样或第三方音乐。原创和弦/旋律在约 167 秒内作八段变化，持续循环；不请求外部音频。作品与合成代码位于 `src/atlas/audio/city-music.js`，随本项目一同管理，无第三方音频许可依赖。

整个页面只有一个音乐实例。进出 Ride、切换日光/夕照/夜景不重启乐句；减少动态偏好不影响音乐。页面 hidden 时挂起上下文，返回后恢复；关闭音乐挂起而非新建实例；dispose 停止节点、断开连接并关闭上下文。

## 验证与证据

九区域真实键盘探索完成 902.222 秒，约 5.74 km，所有区域的阻挡计数和恢复计数均为 0。固定种子采样 1,008 点、8,064 个方向，包含 55 个水面点和 6 个超过 26° 的坡地点，空气墙误报为 0。桥梁独立几何复核覆盖 12 个方向路线和 688,437 个车体 footprint 点，并核对可见几何与 CPU 顶点/索引数组身份。

- `wuhan:free:verify`：相同持续油门输入下，建筑必须停止，树/灌木/花/车辆/桥墩/桥塔/水岸/道路边缘/陡坡/铁路层必须通过；另检查异常边界。
- `wuhan:free:browser`：真实源实例上的树、灌木、花、车流、桥墩、桥塔穿行，以及岸边驶入东湖后与水面等高。
- `wuhan:music:browser`：首次静音、点击播放、音量、骑行进出、三种光照、20 次开关、模拟 hidden/visible 通知、刷新后的可信交互恢复、移动端、减少动态偏好、禁用 localStorage、dispose，以及真实普通建筑的持续加速阻挡。另以 OfflineAudioContext 渲染 170 秒，检查完整乐句与循环交界处的非静音、有限数值及无削波。
- 六桥 25/60 km/h 双向完整浏览器案例全部通过，记录在 `wuhan-free-bridge-browser-qa.json`，汇总在 `wuhan-free-bridge-summary.json`。`wuhan:free:bridge-report` 校验 24 个唯一案例的地面起终点、主桥经过、上层保持、速度、阻挡及恢复计数。全部案例零阻挡、零恢复；终点均位于 canonical 地面道路上，距既定路线终点不超过 2.5 米。重叠 OSM 道路可能提供相同地点的支撑，验收按实际位置和层级判定，不要求单一 way ID。
- 原有回归继续运行。旧水体禁止、坡度停车、桥结构和汽车阻挡断言按新规则改为通行；建筑、源几何、60 km/h、渲染与生命周期检查保留。动态资源检查允许过期 chunk 正常卸载，但不允许切换光照造成几何数量增加。

浏览器报告为本地 headless Chrome；移动端为模拟视口。音频 QA 验证了实际合成输出和浏览器生命周期，未进行实体扬声器/耳机试听。此前的 `wuhan-phase61.md` 和历史矩阵描述旧碰撞策略，不能用其旧通行规则解释当前产品。

深圳、Cloudflare Pages 配置和 City Pack 字节保持不变。构建仍为 `npm run atlas:build`，输出 `atlas-site`；完整性校验保留。用户安排本次只作本地提交，由用户手动 push。

构建验收应依次执行 `verify`、`public:verify`、`atlas:build`、`atlas:verify`。`public:verify` 会重建 public-site 并更新报告时间戳，因此不能在 atlas 构建之后再重建基线，否则会对报告文件产生基线不一致的误报。

本轮以下 npm scripts 已通过（武汉命令均带 `wuhan:` 前缀）：

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| 基础与构建 | `verify`、`public:verify`、`atlas:build`、`atlas:verify` | PASS |
| 城市与动态 | `browser`、`landmarks:verify`、`traffic:verify`、`vessels:verify`、`dynamics:browser` | PASS |
| 骑行与几何 | `ride:verify`、`ride:browser`、`road:verify`、`vegetation:verify`、`highspeed:verify`、`screenshots:verify` | PASS |
| 六桥与空气墙 | `bridge-runtime:verify`、`airwall:verify`、`collision:verify`、`phase61:browser`、`free:bridge-report` | PASS |
| 最终与数据 | `final:browser`、`diagnostics:browser`、`explore:browser`、`checkout:verify` | PASS |
| 新产品规则 | `free:verify`、`free:browser`、`music:browser` | PASS |

实际 Git LF checkout 校验通过 5,918 个资产的长度和 SHA256；3,629 个 Phase 1–5 资产保持原字节。验收未包含线上部署或实体手机/音响测试。
