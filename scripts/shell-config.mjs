/**
 * Strategy-A build configuration for the private cityinminiatures.top study rebuild.
 *
 * The mirrored HTML and runtime bundles are the byte-level specification. The
 * build therefore copies the complete runtime verbatim and only registers one
 * intentional document change: the private-study notice plus noindex policy.
 */
const runtimeFiles = [
  "mirror/404.html",
  "mirror/assets/index-CJdN52Ic.css",
  "mirror/assets/index-zfVzkv9E.js",
  "mirror/assets/traffic-Cw95n69J.js",
  "mirror/audio/bay-breeze.mp3",
  "mirror/data/activity.076c47374f6c.json",
  "mirror/data/buildings.154e3e0b73a0.json",
  "mirror/data/elevation.1fb0e5de0b0a.json",
  "mirror/data/geography.62cb8ed28b0f.json",
  "mirror/data/night-lighting.8e73a8b6b3f3.json",
  "mirror/data/surfaces.647933fc1440.json",
  "mirror/data/terrain-buffers.d7448f9f8c14.bin",
  "mirror/data/terrain-meta.2a788207027b.json",
  "mirror/data/traffic-demand.7b70bd13efe8.json",
  "mirror/data/traffic-meta.e4b4ee40e799.json",
  "mirror/data/traffic-points.b0b12d5d1d1e.bin",
  "mirror/data/urban-instances.455bffafcaaf.bin",
  "mirror/data/urban-meta.ce5f75845c71.json",
];

export default {
  pages: [{ rel: "index.html", route: "/" }],
  extras: runtimeFiles.map((from) => ({ from, to: from.slice("mirror/".length) })),
  originHosts: ["cityinminiatures.top", "www.cityinminiatures.top"],
  stubExtHosts: ["static.cloudflareinsights.com"],
  mirroredExtHosts: [],
  notice:
    "<!--\n" +
    "  UNOFFICIAL PRIVATE STUDY REBUILD of cityinminiatures.top.\n" +
    "  Not affiliated with or endorsed by the original creator. Artwork, copy,\n" +
    "  audio and trade dress remain the property of their respective owners.\n" +
    "  Private, noindex, and not published.\n" +
    "-->\n",
  floors: { "T-LOCALIZE": 0, "T-DATA-KEEP": 0, "T-NOINDEX": 1 },
  transforms: [],
  purposeChecks: [],
};
