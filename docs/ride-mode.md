# 骑行模式（第一阶段升级）

## 接入与边界

`public-overlay/ride/ride-controller.js` 继续通过 `scripts/ride-transforms.mjs` 的计数校验接缝，在城市主循环调用 `ride.update(dt)`；未增加 RAF、渲染器或 Three 副本。`site/`、`src/readable/`、城市数据、交通与昼夜代码没有修改。`RideCollision` 原文件保持不变，包括三角形地形插值、建筑、城市边界、陆地判断、桥梁层和道路出生点。

`npm run public:build` 仍从原始 site 加 overlay 生成 public-site；Cloudflare Pages 的构建命令与输出目录不变。overlay 文件参与现有版本哈希，新动画模块通过相对 URL 导入，支持子目录挂载。

## PaperRoute 实际代码核查

参考本地 paper-game 提交 `faa58ec4e77929c0ae39f64124e14a6244445396`，运行文件 `assets/main-BvT_ToLo.js`。下述偏移是 JS 字符偏移，仅用于定位这份压缩文件，不是移植依赖。

- `Aa / ka / Na / Pa`（约 96,600–99,300）：先 fetch posed-rider，再 parseAsync、检查骨骼与自行车节点、复制带骨架场景、保存静止姿态和手脚接触偏移；加载链为 `Aa().then(e => e || Wa())`，最终还可回退到程序化人物。
- `Wa / Ua / Ka / Xa`（约 99,000–105,500）：meshy-rider 是旧版人体蒙皮模型，配合程序化自行车，另含头发、衣摆和包骨骼。
- 两个 GLB 的 JSON 块均为 glTF 2.0 / Blender 导出、一个 skin、**没有 animations 片段**。posed 包含 RiderBody、FittedBicycle、转向组件、轮子、曲柄、脚踏与完整四肢骨骼；meshy 只有人体部分。这不是播放 AnimationMixer 片段的骑手。
- `oa / sa`：踩踏相位由实际前进距离积分，轮子绕轴转动，左右脚踏相差 π，曲柄连接中轴与脚踏。原版固定街道可以用 z 距离；深圳使用通过碰撞检查后的**有符号三维行驶距离**，支持自由转向、倒车与坡道。
- `Fi / Ii / zi / Ai / Bi / Ca / wa / Ta`（约 83,600–96,600）：保存/恢复骨骼静止姿态，将车把/脚踏接触点换算到人体空间，用两段 IK 求肘/膝，再转换到骨骼父空间；手保持车把接触、脚跟随脚踏，身体随速度前倾。
- movement（约 2,382,000）通过指数响应趋向 cruise/brake/sprint 目标速度，`Hi` 调节高速转向响应，`Ui / Wi / Gi` 驱动车把、倾斜和前倾。原版 S 只是降到正向低速、横向输入改变车道；这些道路约束没有移植。
- `Ud / Wd`（约 251,300）：cameraMemory 保存跟随位置、时间、swing、pace、街道侧向；指数平滑位置/转向摆动，速度增加距离和 FOV，目标在前方 4.8。`Qp` 把计算结果应用到原有相机；其中道路变形、smash 特效没有移植。

本实现仅据上述行为独立整理了运动、接触 IK 与跟随相机逻辑，没有复制整个 production bundle，也没有引入 PaperRoute 的街道、碰撞、送报或计分系统。

## 模块职责

- `ride-avatar.js`：创建现有 Three 实例的程序化骑手、自行车与接触点，管理可选模型的异步加载、校验、替换、回退和资源销毁。
- `ride-animation.js`：独立的两段 IK、距离驱动轮子/脚踏/曲柄、车把转向、手部约束、腿部踩踏、身体倾斜；另提供 `PosedRideAnimation` 骨骼适配器。
- `ride-motion.js`：最高前进速度仍为 9 m/s、倒车 2 m/s；有界加速趋向目标速度，反向输入先减速再倒车，Space 制动；转向随速度降低灵敏度，松键平滑回中。
- `ride-controller.js`：保留 1/120 s 碰撞子步与 terrain pitch/roll；仅累计接受的位移驱动动画，撞墙后不原地空踩；主循环时间上限一致。
- `ride-camera.js`：距离 6.4→7.5、高度约 3.1、前视 4.8→5.4、FOV 57→60；各项以 SCALE 转为城市单位。小幅偏置、转弯 swing 和鼠标偏角分开处理，松开后缓动回正；偏好减少动态效果时关闭 swing/速度 FOV。竖屏略增加距离和高度。

镜头从**跟随车轮支撑高度的骑手胸部位置**检测 boom，不能从远处的道路 target 开始检测。先检查目标位置，再检查平滑后的实际位置，采样间隔不超过 .012 城市单位，检测建筑和地表。视线只保留小幅地表间隙，相机本体单独执行更大的离地检查，避免道路边缘误缩镜头；靠近障碍时优先收缩，离开时平滑延长。坡道使用现有高度层，并对前视高度做有限补偿。极窄空间可能显著缩短 boom，这是避障优先的取舍。

Esc 恢复进入前的相机位置、四元数、near/far、zoom、FOV、view offset、OrbitControls target 和 enabled；保留原有停止飞行及清除 Orbit 惯性的处理。地点飞行与缩放先退出骑行。

## 模型授权与可选接入

当前公开产物**默认使用本项目程序化骑手**，已具备动态车轮、转向、脚踏、曲柄、四肢 IK。没有拷贝或请求 paper-game 的 GLB。

本次检查的 paper-game README 仅说明它是公开页面的静态副本；仓库未包含 LICENSE/NOTICE，两个 GLB 的 asset/extras 也没有复用许可。公开可下载不等于明确允许再分发。启用前需要确认 posed-rider.glb 的人体、贴图、自行车及其改编/公开发布权限和署名要求；如还要使用旧版 meshy-rider.glb，也需单独确认它的来源及许可。

后续可以向 `createRide` 的 context 传入 `rideModel`：

```js
rideModel: {
  url: './models/licensed-posed-rider.glb', // 相对 ride-avatar.js，不能硬编码站点根路径
  loadScene: async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Rider HTTP ${response.status}`);
    // 使用与城市 Three 版本兼容的 GLTFLoader；每次返回独立场景及骨架。
    return (await loader.parseAsync(await response.arrayBuffer(), new URL('.', url).href)).scene;
  },
  timeoutMs: 8000
}
```

发布配置没有该选项，也不包含 GLTFLoader。接口接受完整 posed 骨架（含 `handlebar-grip:-1` / `handlebar-grip:1`），校验后按原有轮距归一化，驱动静止姿态和四肢 IK。meshy-only 模型会安全回退，需要另配自行车和绑定适配器。加载失败、超时、骨架不完整或更新异常均保留/恢复程序化骑手；迟到加载结果与退出销毁后的结果会释放资源。

真实授权模型的外观、服装穿插与接触校准仍需在授权后进行视觉验收，不能把接口验证等同于已经公开采用该 GLB。

## 验证

- `npm run public:verify`：现有构建、完整文件/路径验证与 Ride 测试；原有测试保留。
- `npm run verify:ride`：额外覆盖速度响应、高速转向、陆地/出生点、实际距离动画、反向轮转、左右脚踏相位、IK 接触/不可达目标、模型失败/无效/超时回退、合成骨架接触点、模型替换与销毁竞态、前方道路 target、速度拉远/FOV、swing/拖动回正、建筑/地面避障、完整相机恢复与单循环。
- `npm run verify:source`：144 个可读切片与原始 bundle 逐字节一致。
- `node scripts/check-ride-browser.mjs`：真实城市浏览器回归，根路径与两种子目录挂载、前进/转向/制动/倒车/拖动、语言/音乐、退出恢复与 Orbit 浏览，以及骑行中昼夜切换、城市地点飞行退出。截图与结果写入本地 probe/ride（非公开产物）。

第二阶段优先做授权模型校准、深圳密集街区/连续坡道/桥下的长距离试骑，以及极窄空间的镜头构图优化。游戏玩法不在本阶段范围内。
