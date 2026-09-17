# 运行资产账本

权威资产清单是 `mirror/mirror-manifest.json`。`scripts/shell-config.mjs` 按该清单把 18 个非页面运行文件逐字复制到 `site/`，HTML 则只注入私有研究声明和 `noindex`。

运行面包括：

- 3 个前端文件：主 CSS、主 ESM chunk、交通 ESM chunk；
- 1 个音频文件：`audio/bay-breeze.mp3`；
- 13 个 JSON/二进制城市数据文件；
- 1 个源站 404 模板。

复核方法：

1. `npm run verify:site` 证明构建可复现，且 HTML 差异全部可由登记变换重放；
2. `scripts/verify-refs-served.mjs` 向真实本地服务器逐条询问静态引用；
3. `scripts/verify-offline.mjs` 枚举伺服字节中的外部绝对 URL；
4. 浏览器走查验证运行时拼出的 13 个数据 URL 与音频资源。

此账本只描述技术完整性，不代表任何素材可公开再分发。
