# 可读源码层

`src/readable/` 是运行 chunk 的拼接式分解视图。浏览器仍执行 `site/assets/` 中的原始文件；这里的目标是让工程师能够逐片阅读，同时保持最强的等价证明。

## 坐标

- `index-zfVzkv9E/`：主应用与 Three.js r185 运行时，共 140 片。
- `traffic-Cw95n69J/`：交通模拟延迟 chunk，共 4 片。
- 每个目录的 `slices.json` 记录原 chunk、字节区间、行号、大小和 SHA-256。
- 文件名只采用切片首声明已有的压缩标识符；没有证据时不擅自命名。

按 `slices.json` 顺序连接所有 `.js` 文件，会逐字节还原原 chunk。验证命令：

```powershell
npm run verify:source
```

切片文件没有添加注释或改名，因为任何额外字节都会破坏重组证明。语义说明集中在 `docs/engine-notes.md`，美化坐标位于 `mirror/_pretty/`。
