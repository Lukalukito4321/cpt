// cpt.js - Capture watcher + HIT stats + small web server
// 1) Edit TOKEN / CHANNEL_ID / LOG_PATH via environment variables or .env
// 2) Run:  npm install  &&  npm start

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const chokidar = require("chokidar");
const fs = require("fs");
const express = require("express");
const path = require("path");

// ---------- SETTINGS ----------
let dotenvLoaded = false;
try {
  // Will silently do nothing if .env doesn't exist (Railway is fine)
  require("dotenv").config();
  dotenvLoaded = true;
} catch (e) {
  console.log("dotenv not found – this is fine if you use real env vars (e.g. Railway).");
}

// BOT TOKEN (MUST be set)
const DISCORD_TOKEN = process.env.TOKEN || "";
if (!DISCORD_TOKEN) {
  console.error("❌ No TOKEN environment variable found. Set TOKEN in .env or Railway variables.");
  process.exit(1);
}

// DISCORD CHANNEL
const CHANNEL_ID = process.env.CHANNEL_ID || "1441330193883987999"; // change or move to env if you like

// LOG PATH – override via LOG_PATH env when needed (e.g. Railway)
const DEFAULT_LOG_PATH = "C:\\Users\\viado\\PyCharmMiscProject\\capture\\server.log";
const LOG_PATH = process.env.LOG_PATH || DEFAULT_LOG_PATH;

// Web server port
const WEB_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// ---------- DISCORD CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------- STATIC FILES ----------
const WEB_DIR = path.join(__dirname, "public");
if (!fs.existsSync(WEB_DIR)) {
  fs.mkdirSync(WEB_DIR, { recursive: true });
}

const app = express();
app.use(express.static(WEB_DIR));

// In-memory stats
let playerStats = {
  ballas: {},
  marabunta: {},
  families: {},
  vagos: {},
  bloods: {}
};

// Simple stats API for frontend (script.js)
app.get("/stats", (req, res) => {
  res.json(playerStats);
});

app.listen(WEB_PORT, () => {
  console.log(`🌐 Web server running at http://localhost:${WEB_PORT}`);
});

// Gang colors/emojis
const gangColors = {
  ballas:   { emoji: "🟪", color: 0x800080 },
  families: { emoji: "🟢", color: 0x2ECC71 },
  marabunta:{ emoji: "🟦", color: 0x3498DB },
  bloods:   { emoji: "🩸", color: 0xE74C3C },
  vagos:    { emoji: "🟨", color: 0xF1C40F }
};

// ---------- DISCORD READY + LOG WATCH ----------
client.once("ready", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);

  if (!fs.existsSync(LOG_PATH)) {
    console.warn(`⚠ LOG_PATH does not exist: ${LOG_PATH}`);
    console.warn("   Create the file or set LOG_PATH env var correctly.");
  } else {
    console.log("📄 Watching log file:", LOG_PATH);
  }

  chokidar.watch(LOG_PATH, {
    persistent: true,
    usePolling: true,
    interval: 300,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  })
    .on("change", filePath => {
      console.log("🔄 File changed:", filePath);
      readLastLine(LOG_PATH, (line) => {
        if (!line) return;
        console.log("➡ NEW LINE:", line);
        parseLogLine(line);
      });
    })
    .on("error", err => console.error("Watcher error:", err));
});

// ---------- HELPERS ----------
function readLastLine(filePath, callback) {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Read error:", err.message);
      return callback(null);
    }
    const trimmed = data.trim();
    if (!trimmed) return callback(null);
    const lines = trimmed.split("\n");
    callback(lines[lines.length - 1] || null);
  });
}

// MAIN log parser
function parseLogLine(line) {
  if (line.includes("[HIT]")) {
    parseHitLine(line);
    return;
  }

  if (!line.includes("[CAPTURE]")) return;

  const regex = /\[CAPTURE\]\s+gang1=(.*?)\s+gang2=(.*?)\s+start=(.*?)\s+weapon=(.*)$/;
  const m = line.match(regex);
  if (!m) {
    console.log("CAPTURE line didn't match expected format.");
    return;
  }

  const gang1 = m[1].toLowerCase();
  const gang2 = m[2].toLowerCase();
  const start = m[3];
  const weapon = m[4];

  sendEmbedAndCreateSite(gang1, gang2, start, weapon);
}

// HIT line parser
// Example: [HIT] gang=Ballas nick=AV_ASSA hits=3 headshots=1 dmg=90
function parseHitLine(line) {
  const hitRegex = /\[HIT\]\s+gang=(.*?)\s+nick=(.*?)\s+hits=(\d+)\s+headshots=(\d+)\s+dmg=(\d+)/;
  const match = line.match(hitRegex);
  if (!match) {
    console.log("HIT line didn't match expected format.");
    return;
  }

  const gangRaw = match[1];
  const gang = gangRaw.toLowerCase();
  const nick = match[2];
  const hits = parseInt(match[3], 10);
  const headshots = parseInt(match[4], 10);
  const damage = parseInt(match[5], 10);

  if (!playerStats[gang]) {
    console.log("Unknown gang in HIT line:", gangRaw);
    return;
  }

  if (!playerStats[gang][nick]) {
    playerStats[gang][nick] = { hits: 0, headshots: 0, damage: 0 };
  }

  playerStats[gang][nick].hits += hits;
  playerStats[gang][nick].headshots += headshots;
  playerStats[gang][nick].damage += damage;

  console.log(`✅ Updated stats for ${gangRaw}/${nick}:`, playerStats[gang][nick]);
}

// Create unique HTML page for each capture
function createCapturePage(g1, g2, start, weapon) {
  const emoji1 = gangColors[g1]?.emoji || "⚔️";
  const emoji2 = gangColors[g2]?.emoji || "🛡️";

  const titleText = `${g1.toUpperCase()} vs ${g2.toUpperCase()}`;

  const html = `<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleText} • Capture</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="wrapper">
    <header class="header">
      <img src="a.webp" alt="logo" class="logo">
      <div class="header-text">
        <h1 class="title">${titleText} • Capture</h1>
        <p class="subtitle">Auto generated from server.log</p>
      </div>
    </header>

    <section class="info-section">
      <div class="info-cards">
        <div class="card"><strong>Attacker</strong><br>${emoji1} ${g1.toUpperCase()}</div>
        <div class="card"><strong>Defender</strong><br>${emoji2} ${g2.toUpperCase()}</div>
        <div class="card"><strong>Start</strong><br>${start}</div>
        <div class="card"><strong>Weapon</strong><br>${weapon}</div>
      </div>
    </section>

    <section class="tables">
      <div class="table_box">
        <div class="title-row">
          <div class="pill pill-ballas">${g1.toUpperCase()}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nickname</th>
              <th>Hits</th>
              <th>Headshots</th>
              <th>Headshot %</th>
              <th>Damage</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5">Stats are visible on main panel (index.html)</td></tr>
          </tbody>
        </table>
      </div>

      <div class="table_box">
        <div class="title-row">
          <div class="pill pill-families">${g2.toUpperCase()}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nickname</th>
              <th>Hits</th>
              <th>Headshots</th>
              <th>Headshot %</th>
              <th>Damage</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5">Stats are visible on main panel (index.html)</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <footer class="footer">Capture Logs • NEXUS</footer>
  </div>
</body>
</html>`;

  const fileName = `capture-${Date.now()}-${g1}-vs-${g2}.html`;
  const filePath = path.join(WEB_DIR, fileName);
  fs.writeFileSync(filePath, html, "utf8");

  return `http://localhost:${WEB_PORT}/${fileName}`;
}

// Send embed + button to Discord
function sendEmbedAndCreateSite(g1, g2, start, weapon) {
  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) {
    console.error("❌ Channel not found. Check CHANNEL_ID.");
    return;
  }

  const siteUrl = createCapturePage(g1, g2, start, weapon);

  const color1 = gangColors[g1]?.color || 0x800080;
  const emoji1 = gangColors[g1]?.emoji || "⚔️";
  const emoji2 = gangColors[g2]?.emoji || "🛡️";

  const embed = new EmbedBuilder()
    .setColor(color1)
    .setTitle(`${emoji1} ${g1.toUpperCase()} vs ${emoji2} ${g2.toUpperCase()}`)
    .setDescription("დაიწყოო!")
    .addFields(
      { name: "⏰ დაწყების დრო", value: `**${start}**`, inline: true },
      { name: "🔫 იარაღი", value: `**${weapon}**`, inline: true },
      { name: "⚔️ შეტევა", value: `${emoji1} **${g1.toUpperCase()}**`, inline: true },
      { name: "🛡️ დაცვა", value: `${emoji2} **${g2.toUpperCase()}**`, inline: true }
    )
    .setFooter({ text: "Capture Bot • Stay alert!" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("გადასვლა საიტზე")
      .setURL(siteUrl)
      .setStyle(ButtonStyle.Link)
  );

  channel.send({ embeds: [embed], components: [row] })
    .then(() => console.log("📨 Embed + site link sent."))
    .catch(err => console.error("Send error:", err));
}

// ---------- LOGIN ----------
client.login(DISCORD_TOKEN).catch(err => {
  console.error("Login failed:", err);
});
