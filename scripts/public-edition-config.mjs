export const sourceRoot = "site";
export const outputRoot = "public-site";
export const overlayRoot = "public-overlay";

const authorizedNotice = `<!--
  AUTHORIZED PUBLIC EDITION of the Shenzhen 3D city experience.
  Published by Miniature City Atlas with rights-holder authorization.
  City and map data credits are listed at /ATTRIBUTION.html.
  Preview build: noindex until the production domain is approved.
-->`;

const oldNotice = `<!--
  UNOFFICIAL PRIVATE STUDY REBUILD of cityinminiatures.top.
  Not affiliated with or endorsed by the original creator. Artwork, copy,
  audio and trade dress remain the property of their respective owners.
  Private, noindex, and not published.
-->`;

export const transforms = {
  "index.html": [
    { id: "P-NOTICE", from: oldNotice, to: authorizedNotice, count: 1 },
    {
      id: "P-META",
      from: '<meta name="description" content="在山脊、街巷与海湾之间，探索深圳的 3D 微缩城市。" />',
      to: '<meta name="description" content="在真实地理之上探索深圳的山海、街区与天际线。" />\n    <meta property="og:type" content="website" />\n    <meta property="og:title" content="微缩城市图志 · 深圳" />\n    <meta property="og:description" content="真实地理，微缩呈现。" />',
      count: 1,
    },
    { id: "P-BRAND", from: "SHENZHEN IN MINIATURE", to: "MINIATURE CITY ATLAS", count: 1 },
    { id: "P-TITLE", from: "深圳·山海之间 | Shenzhen in Miniature", to: "微缩城市图志 · 深圳 | Miniature City Atlas", count: 1 },
    { id: "P-BOOT-TITLE-ZH", from: String.raw`\u6DF1\u5733\xB7\u5C71\u6D77\u4E4B\u95F4 | Shenzhen in Miniature`, to: "微缩城市图志 · 深圳 | Miniature City Atlas", count: 1 },
    { id: "P-BOOT-TITLE-EN", from: String.raw`Shenzhen in Miniature \xB7 Mountains & Sea`, to: "Miniature City Atlas · Shenzhen", count: 1 },
    { id: "P-BOOT-LOADING-ZH", from: String.raw`\u4E00\u5EA7\u57CE\uFF0C\u5C71\u6D77\u4E4B\u95F4\u3002`, to: "真实深圳，微缩呈现。", count: 1 },
    { id: "P-BOOT-DETAIL-ZH", from: String.raw`\u6B63\u5728\u5C55\u5F00\u6DF1\u5733\u7684\u6D77\u5CB8\u4E0E\u5C71\u810A\u2026`, to: "正在载入深圳的城市图层…", count: 1 },
    { id: "P-BOOT-DETAIL-EN", from: String.raw`Unfolding the coast and mountains\u2026`, to: "Loading Shenzhen's city layers…", count: 1 },
    { id: "P-LOADING", from: "一座城，山海之间。", to: "真实深圳，微缩呈现。", count: 1 },
    { id: "P-LOADING-EN", from: "A city between mountains and sea.", to: "Real Shenzhen, rendered in miniature.", count: 1 },
    { id: "P-LOADING-DETAIL", from: "正在展开深圳的海岸与山脊…", to: "正在载入深圳的城市图层…", count: 1 },
  ],
  "assets/index-zfVzkv9E.js": [
    { id: "P-BRAND", from: "SHENZHEN IN MINIATURE", to: "MINIATURE CITY ATLAS", count: 1 },
    { id: "P-TITLE", from: "深圳·山海之间 | Shenzhen in Miniature", to: "微缩城市图志 · 深圳 | Miniature City Atlas", count: 1 },
    { id: "P-TITLE-EN", from: "Shenzhen in Miniature · Mountains & Sea", to: "Miniature City Atlas · Shenzhen", count: 1 },
    { id: "P-DESCRIPTION", from: "在山脊、街巷与海湾之间，探索深圳的 3D 微缩城市。", to: "在真实地理之上探索深圳的山海、街区与天际线。", count: 1 },
    { id: "P-DESCRIPTION-EN", from: "Explore a living 3D miniature of Shenzhen, from city streets to mountains and bays.", to: "Explore real Shenzhen through an authorized interactive 3D city atlas.", count: 1 },
    { id: "P-LOADING", from: "一座城，山海之间。", to: "真实深圳，微缩呈现。", count: 1 },
    { id: "P-LOADING-EN", from: "A city between mountains and sea.", to: "Real Shenzhen, rendered in miniature.", count: 1 },
    { id: "P-LOADING-DETAIL", from: "正在展开深圳的海岸与山脊…", to: "正在载入深圳的城市图层…", count: 1 },
    { id: "P-LOADING-DETAIL-EN", from: "Unfolding the coast and mountains…", to: "Loading Shenzhen's city layers…", count: 1 },
    { id: "P-SUBTITLE-I18N", from: '山海之间:"Mountains & Sea"', to: '城市图志:"City Atlas"', count: 1 },
    { id: "P-SUBTITLE", from: 'city-subtitle">山海之间', to: 'city-subtitle">城市图志', count: 1 },
    { id: "P-TAGLINE-I18N", from: '"越过天际线，走进这座城。":"Beyond the skyline, into the city."', to: '"真实地理，微缩呈现。":"Real geography, rendered in miniature."', count: 1 },
    { id: "P-TAGLINE", from: "<p>越过天际线，走进这座城。</p>", to: "<p>真实地理，微缩呈现。</p>", count: 1 },
    { id: "P-EXPORT-CREDIT", from: "© OpenStreetMap contributors · Shenzhen in Miniature", to: "© OpenStreetMap contributors · Miniature City Atlas", count: 1 },
    { id: "P-CREDITS-LINK", from: "Mapzen Terrain</a></footer>", to: 'Mapzen Terrain</a><span> · </span><a href="/ATTRIBUTION.html" target="_blank" rel="noopener">数据与许可</a></footer>', count: 1 },
  ],
};

export function applyTransforms(rel, source) {
  let text = source;
  const hits = [];
  for (const rule of transforms[rel] || []) {
    const found = text.split(rule.from).length - 1;
    if (found !== rule.count) throw new Error(`${rel}: ${rule.id} expected ${rule.count}, found ${found}`);
    text = text.split(rule.from).join(rule.to);
    hits.push([rule.id, found]);
  }
  return { text, hits };
}
