export async function loadPack(manifestURL, { signal, progress = () => {} } = {}) {
  async function request(url) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`数据读取失败 (${response.status}): ${new URL(url).pathname}`);
    return response;
  }
  const manifest = await (await request(manifestURL)).json();
  if (manifest.schemaVersion !== 1 || manifest.runtime !== 'atlas-terrain-v1' || !manifest.datasetId || manifest.id !== 'wuhan') throw new Error('城市数据版本不兼容，请重新构建武汉 City Pack。');
  const buffers = {};
  let loaded = 0;
  const entries = Object.entries(manifest.dataFiles).filter(([, info]) => !info.role || info.role === 'foundation');
  const pending = new Map();
  async function loadAsset(name) {
    if (buffers[name]) return buffers[name];
    if (pending.has(name)) return pending.get(name);
    const metadata = manifest.dataFiles[name];
    if (!metadata) throw new Error(`未登记的资源: ${name}`);
    const task = fetchAsset(name, metadata).finally(() => pending.delete(name));
    pending.set(name, task);
    return task;
  }
  async function fetchAsset(name, metadata) {

    if (!/^[a-z0-9-]+\.(bin|json)$/.test(name)) throw new Error('无效的数据文件路径');
    const url = new URL(name, new URL(manifest.dataRoot, manifestURL));
    const body = await (await request(url)).arrayBuffer();
    if (body.byteLength !== metadata.bytes) throw new Error(`数据不完整: ${name}`);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(v => v.toString(16).padStart(2, '0')).join('');
    if (hash !== metadata.sha256) throw new Error(`数据校验失败: ${name}，请刷新或重新构建。`);
    if (metadata.compression === 'gzip') {
      if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持地形解压，请使用新版 Chrome、Edge、Firefox 或 Safari。');
      buffers[name] = await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if (buffers[name].byteLength !== metadata.decodedBytes) throw new Error(`解压后的数据长度不正确: ${name}`);
    } else buffers[name] = body;
    return buffers[name];
  }
  await Promise.all(entries.map(async ([name]) => { await loadAsset(name); progress(++loaded / entries.length); }));
  const json = name => JSON.parse(new TextDecoder().decode(buffers[name]));
  return { manifest, buffers, loadAsset, loadJSON: async name => JSON.parse(new TextDecoder().decode(await loadAsset(name))), waters: json('water.json'), quality: json('quality.json') };
}
