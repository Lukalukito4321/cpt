// cpt.js - Capture watcher + HIT stats + small web server
// 1) შეცვალე ქვემოთ მითითებული DISCORD_TOKEN / CHANNEL_ID / LOG_PATH
// 2) გაუშვი:  npm install  &&  npm start

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

// ---------- SETTINGS (შეแกვე) ----------
require("dotenv").config();   // load .env

const DISCORD_TOKEN = process.env.TOKEN;  // .env: TOKEN=your_token_here
const CHANNEL_ID = "1441330193883987999"; // აქ ჩასვი არხის ID
const LOG_PATH = "C:\\Users\\viado\\PyCharmMiscProject\\capture\\server.log";  // server.log-ის გზა

// create Discord client (ONLY ONCE)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const WEB_PORT = 3000;                                      // ვებ-პორტი (http://localhost:3000)
// --------------------------------------

// Static files (public/index.html, style.css, script.js, a.webp, generated *.html)
const WEB_DIR = path.join(__dirname, "public");
if (!fs.existsSync(WEB_DIR)) {
  fs.mkdirSync(WEB_DIR, { recursive: true });
}

// --- Express web server ---
const app = express();
app.use(express.static(WEB_DIR));

// In-memory player stats
// gang keyები არის lower-case: ballas, marabunta, families, vagos, bloods
let playerStats = {
  ballas: {},
  marabunta: {},
  families: {},
  vagos: {},
  bloods: {}
};

// API რომ frontend-მა გამოითხოვოს სტატი
app.get("/stats", (req, res) => {
  res.json(playerStats);
});

app.listen(WEB_PORT, () => {
  console.log(`Web server running at http://localhost:${WEB_PORT}`);
});

// Gang colors/emojis
const gangColors = {
  "ballas":   { emoji: "🟪", color: 0x800080 },
  "families": { emoji: "🟢", color: 0x2ECC71 },
  "marabunta":{ emoji: "🟦", color: 0x3498DB },
  "bloods":   { emoji: "🩸", color: 0xE74C3C },
  "vagos":    { emoji: "🟨", color: 0xF1C40F }
};

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  console.log("Watching file:", LOG_PATH);

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
      console.log("File changed:", filePath);
      readLastLine(LOG_PATH, (line) => {
        if (!line) return;
        console.log("NEW LINE:", line);
        parseLogLine(line);
      });
    })
    .on("error", err => console.error("Watcher error:", err));
});

// წაიკითხავს ბოლო სტრიქონს
function readLastLine(filePath, callback) {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Read error:", err);
      return callback(null);
    }
    const lines = data.trim().split("\n");
    callback(lines[lines.length - 1] || null);
  });
}

// MAIN log parser
function parseLogLine(line) {
  // 1) HIT line
  if (line.includes("[HIT]")) {
    parseHitLine(line);
    return;
  }

  // 2) Capture start line
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
// ფორმატი: [HIT] gang=Ballas nick=AV_ASSA hits=3 headshots=1 dmg=90
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
  const hits = parseInt(match[3]);
  const headshots = parseInt(match[4]);
  const damage = parseInt(match[5]);

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

  console.log(`Updated stats for ${gangRaw}/${nick}:`, playerStats[gang][nick]);
}

// შექმნის უნიკალურ HTML გვერდს თითოეული capture-სთვის
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

  const url = `http://localhost:${WEB_PORT}/${fileName}`;
  return url;
}

// გააგზავნის ემბედს და ბატონს დისკორდში
function sendEmbedAndCreateSite(g1, g2, start, weapon) {
  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) {
    console.error("Channel not found. Check CHANNEL_ID.");
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
    .then(() => console.log("Embed + site link sent."))
    .catch(err => console.error("Send error:", err));
}

// --- LOGIN ---
client.login(DISCORD_TOKEN).catch(err => {
  console.error("Login failed:", err);
});
