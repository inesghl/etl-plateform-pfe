// Pre-render all icons used in the deck to base64 PNG, once.
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Fa = require("react-icons/fa");

function renderIconSvg(IconComponent, color, size) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconPng(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

const NAMES = {
  database: Fa.FaDatabase,
  cogs: Fa.FaCogs,
  shield: Fa.FaShieldAlt,
  users: Fa.FaUsers,
  upload: Fa.FaCloudUploadAlt,
  check: Fa.FaCheckCircle,
  play: Fa.FaPlayCircle,
  bell: Fa.FaBell,
  clock: Fa.FaClock,
  chart: Fa.FaChartBar,
  lock: Fa.FaLock,
  sitemap: Fa.FaSitemap,
  server: Fa.FaServer,
  code: Fa.FaCode,
  envelope: Fa.FaEnvelopeOpenText,
  userShield: Fa.FaUserShield,
  layers: Fa.FaLayerGroup,
  sync: Fa.FaSyncAlt,
  warning: Fa.FaExclamationTriangle,
  rocket: Fa.FaRocket,
  project: Fa.FaProjectDiagram,
  tasks: Fa.FaTasks,
  calendar: Fa.FaCalendarAlt,
  trend: Fa.FaChartLine,
  network: Fa.FaNetworkWired,
  terminal: Fa.FaTerminal,
  ban: Fa.FaBan,
  search: Fa.FaSearch,
  cube: Fa.FaCube,
  flask: Fa.FaFlask,
  fileArchive: Fa.FaFileArchive,
  cogSolo: Fa.FaCog,
  history: Fa.FaHistory,
  userCheck: Fa.FaUserCheck,
  bolt: Fa.FaBolt,
  stop: Fa.FaStopCircle,
  times: Fa.FaTimesCircle,
  list: Fa.FaListUl,
  question: Fa.FaQuestionCircle,
  handshake: Fa.FaHandshake,
  building: Fa.FaBuilding,
  globe: Fa.FaGlobe,
  pie: Fa.FaChartPie,
  link: Fa.FaLink,
  python: Fa.FaPython,
  react: Fa.FaReact,
  git: Fa.FaGitAlt,
  camera: Fa.FaCamera,
  microchip: Fa.FaMicrochip,
  skull: Fa.FaSkullCrossbones,
  fingerprint: Fa.FaFingerprint,
};

async function buildIconSet(colors) {
  // colors: array of hex strings (no '#') to render every icon in
  const out = {};
  for (const [key, Comp] of Object.entries(NAMES)) {
    out[key] = {};
    for (const c of colors) {
      out[key][c] = await iconPng(Comp, "#" + c, 256);
    }
  }
  return out;
}

module.exports = { buildIconSet };
