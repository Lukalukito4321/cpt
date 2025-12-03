// cpt.js - Capture watcher + HIT stats + small web server (HTTP API ვერსია)
// 1) Edit TOKEN / CHANNEL_ID via environment variables ან .env
// 2) Run:  npm install  &&  npm start

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const fs = require("fs");
const express = require("express");
const path = require("path");

// ---------- SETTINGS ----------
let dotenvLoaded = false;
try {
  require("dotenv").config();
  dotenvLoaded = true;
} catch (e) {
  console.log("dotenv not found – ეს ნორმალურია თუ Railway env vars იყენებ.");
}

// BOT TOKEN (MUST be set)
const DISCORD_TOKEN = process.env.TOKEN || "";
if (!DISCORD_TOKEN) {
  console.error("❌ No TOKEN environment variable found. Set TOKEN in .env or Railway variables.");
  process.exit(1);
}

// DISCORD CHANNEL
const CHANNEL_ID = process.env.CHANNEL_ID || "1441330193883987999"; // ჩაანაცვლე თუ სხვაა

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory stats (თუ ოდესღაც HIT-ებს დაემატები)
let playerStats = {
  ballas: {},
  marabunta: {},
  families: {},
  vagos: {},
  bloods: {}
};

// Current capture info (for winner + page reuse)
let currentCapture = {
  gang1: null,
  gang2: null,
  start: null,
  weapon: null,
  winner: null,
  fileName: null
};

// Simple stats API for frontend (script.js)
app.get("/stats", (req, res) => {
  res.json(playerStats);
});

// capture meta API (start + winner etc.)
app.get("/capture", (req, res) => {
  res.json(currentCapture);
});

// ---------- HTTP API: /capture & /winner ----------

// Helper: normalize string
function norm(v) {
  return (v || "").toString().trim();
}

// START CAPTURE
// POST /capture  JSON: { gang1, gang2, start, weapon }
// ასევე შეგიძლია GET /capture?gang1=...&gang2=...&start=...&weapon=...
async function handleCapture(req, res) {
  const gang1 = norm(req.body.gang1 || req.query.gang1).toLowerCase();
  const gang2 = norm(req.body.gang2 || req.query.gang2).toLowerCase();
  const start = norm(req.body.start || req.query.start);
  const weapon = norm(req.body.weapon || req.query.weapon);

  if (!gang1 || !gang2 || !start || !weapon) {
    return res.status(400).json({
      ok: false,
      error: "Required fields: gang1, gang2, start, weapon"
    });
  }

  currentCapture = {
    gang1,
    gang2,
    start,
    weapon,
    winner: null,
    fileName: null
  };

  const siteUrl = await sendEmbedAndCreateSite(gang1, gang2, start, weapon);

  return res.json({
    ok: true,
    gang1,
    gang2,
    start,
    weapon,
    siteUrl
  });
}

app.post("/capture", handleCapture);
app.get("/capture-start", handleCapture); // პატარა ბონუსი ტესტისთვის ბრაუზერიდან

// WINNER
// POST /winner  JSON: { winner }
// ან GET /winner?winner=...
function handleWinner(req, res) {
  const winnerRaw = norm(req.body.winner || req.query.winner);
  const winner = winnerRaw.toLowerCase();

  if (!winner) {
    return res.status(400).json({ ok: false, error: "Required field: winner" });
  }

  if (!currentCapture || !currentCapture.gang1) {
    return res.status(400).json({ ok: false, error: "No active capture" });
  }

  currentCapture.winner = winner;

  const siteUrl = createCapturePage(
    currentCapture.gang1,
    currentCapture.gang2,
    currentCapture.start,
    currentCapture.weapon,
    currentCapture.winner
  );

  return res.json({
    ok: true,
    winner,
    siteUrl
  });
}

app.post("/winner", handleWinner);
app.get("/winner", handleWinner); // GET-იც მუშაობს ტესტისთვის

// ---------- WEB SERVER START ----------
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

// ---------- DISCORD READY ----------
client.once("clientReady", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
});

// ---------- (აი HIT parser შეინახე მომავალისთვის თუ გახდება საჭირო) ----------
// ამ ეტაპზე არ იძახება, მაგრამ stats სტრუქტურა მზადაა მომავალში /hit API-სთვის.
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

// ---------- HTML GENERATOR ----------
function createCapturePage(g1, g2, start, weapon, winner) {
  const emoji1 = gangColors[g1]?.emoji || "⚔️";
  const emoji2 = gangColors[g2]?.emoji || "🛡️";

  const winnerDisplay = winner
    ? `${gangColors[winner]?.emoji || ""} ${winner.toUpperCase()}`
    : "?";

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
        <p class="subtitle"></p>
      </div>
    </header>

    <div class="versus-title">
      ${g1.toUpperCase()} vs ${g2.toUpperCase()}
    </div>

    <section class="info-section">
      <div class="info-cards">
        <div class="card"><strong>Attacker</strong><br>${emoji1} ${g1.toUpperCase()}</div>
        <div class="card"><strong>Defender</strong><br>${emoji2} ${g2.toUpperCase()}</div>
        <div class="card"><strong>Start</strong><br>${start}</div>
        <div class="card"><strong>Winner</strong><br>${winnerDisplay}</div>
        <div class="card"><strong>Weapon</strong><br>${weapon}</div>
        <div class="card card-empty"></div>
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
            <tr><td colspan="5">SOON</td></tr>
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
            <tr><td colspan="5">SOON</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <footer class="footer">Capture Logs • NEXUS</footer>
  </div>
</body>
</html>`;

  // Reuse same file for winner update
  let fileName = currentCapture?.fileName;
  if (!fileName) {
    fileName = `capture-${Date.now()}-${g1}-vs-${g2}.html`;
    currentCapture.fileName = fileName;
  }

  const filePath = path.join(WEB_DIR, fileName);
  fs.writeFileSync(filePath, html, "utf8");

  return `http://localhost:${WEB_PORT}/${fileName}`;
}

// Send embed + button to Discord
async function sendEmbedAndCreateSite(g1, g2, start, weapon) {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error("❌ Channel not found. Check CHANNEL_ID.");
    return null;
  }

  const siteUrl = createCapturePage(g1, g2, start, weapon, currentCapture?.winner || null);

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

  await channel.send({ embeds: [embed], components: [row] })
    .then(() => console.log("📨 Embed + site link sent."))
    .catch(err => console.error("Send error:", err));

  return siteUrl;
}

// ---------- LOGIN ----------
client.login(DISCORD_TOKEN).catch(err => {
  console.error("Login failed:", err);
});
