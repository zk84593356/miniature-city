# 微缩城市图志

项目现在包含两套彼此隔离的产物：

- `site/`：对 `cityinminiatures.top` 的 L3 私有研究基线。
- `public-site/`：经权利方授权的公开衍生版，品牌为“微缩城市图志”，首个真实城市为深圳。

公开版完整保留现有深圳地形、建筑、地标、交通、昼夜、相机、交互和声景；生成门保证所有非文字运行资产与基线逐字一致。当前仍带 `noindex`，尚未部署到公网。

## 本地运行

需要 Node.js 20 或更高版本，无需安装依赖：

```powershell
npm run serve
```

随后打开 <http://127.0.0.1:4173/>。

公开版使用：

```powershell
npm run public:verify
npm run public:serve
```

随后打开 <http://127.0.0.1:4174/>。Cloudflare Pages 或 VPS 只应发布 `public-site/`，不要发布 `mirror/`、`site/` 或 `src/readable/`。

## 验证

```powershell
npm run verify
```

该命令会验证：`site/` 可从镜像重复生成、HTML 只有登记过的 noindex/声明变换、两个可读源码目录能逐字重组为正在运行的原始 chunk、门脚本保持零依赖。

运行版继续使用原始 hash chunk，避免改变 Three.js 场景的求值顺序。可读研究层位于 `src/readable/`；逆向坐标和引擎说明见 `docs/engine-notes.md`。

## 目录

- `site/`：完整、自包含的本地运行版本。
- `public-site/`：可部署的授权公开版；由脚本生成，不手工修改。
- `public-overlay/`：公开版署名、隐私、部署头、404 和城市清单。
- `src/readable/`：按安全边界切开的可读研究视图；不直接由浏览器执行。
- `mirror/`：只读源站证据与抓包账本。
- `docs/`：chunk 图、引擎笔记和验收记录。
- `REBUILD_PLAN.md`：阶段、偏差、怪癖与版权风险登记。
- `DEPLOY.md`：发布事实、素材权利未知项和公开路径选择。
- `docs/city-pack-contract.md`：深圳与未来大理等真实城市包的扩展合同。

此项目仅用于私下研究。原站文案、音频、城市数据、视觉资产与品牌表达的权利归各自权利人所有。
