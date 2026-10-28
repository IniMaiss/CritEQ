/**
 * CritEQ Comprehensive IEM Preset Exporter & Consolidator
 * Aggregates all IEM/earbud parametric EQ profiles from AutoEq, Squiglink, and Crinacle.
 */

import fs from 'fs';
import path from 'path';
import { parsePEQ } from '../dist/peq/peq-parser.js';

const sourceResultsDir = '/tmp/autoeq_git_test/results';
const targetPresetDir = '/Users/atha/Documents/Test/Preset';

console.log('--- CritEQ IEM Presets Consolidation ---');

function walk(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results = results.concat(walk(full));
    } else if (ent.name.endsWith('ParametricEQ.txt')) {
      results.push(full);
    }
  }
  return results;
}

const allParametricFiles = walk(sourceResultsDir).filter((filePath) => {
  const rel = path.relative(sourceResultsDir, filePath);
  const parts = rel.split(path.sep);
  if (parts.length < 3) return false;
  const category = parts[1].toLowerCase();
  return category.includes('in-ear') || category.includes('earbud');
});

console.log(`Discovered ${allParametricFiles.length} IEM / Earbud measurement profiles.`);

const items = [];
const SQUIGLINK_SOURCES = new Set([
  'Super Review',
  'ToneDeafMonk',
  'Jaytiss',
  'RikudouGoku',
  'Harpo',
  'Filk',
  'Fahryst',
  'Kazi',
  'DHRME',
  'kr0mka',
  'freeryder05',
  'Bakkwatan',
  "Ted's Squig Hoard",
  'Auriculares Argentina',
]);

for (const filePath of allParametricFiles) {
  const rel = path.relative(sourceResultsDir, filePath);
  const parts = rel.split(path.sep);
  const source = parts[0];
  const category = parts[1];
  const model = parts[2];

  let sourceTag = source;
  let sourceGroup = 'AutoEq & Reference';

  if (source === 'crinacle') {
    sourceGroup = 'Crinacle';
    sourceTag = category.includes('711') ? 'Crinacle' : 'Crinacle (B&K 4620)';
  } else if (SQUIGLINK_SOURCES.has(source)) {
    sourceGroup = 'Squiglink';
    sourceTag = source;
  } else {
    sourceGroup = 'AutoEq & Reference';
    if (category.includes('5128')) {
      sourceTag = `${source} (B&K 5128)`;
    } else {
      sourceTag = source;
    }
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8').trim();

  // Sanitize Q < 0.185 to 0.19 to strictly satisfy bandwidth bounds [0.05, 5.0 oct]
  const sanitizedContent = rawContent.replace(/\bQ\s+([\d.]+)/g, (match, qStr) => {
    const q = parseFloat(qStr);
    if (q < 0.185) return 'Q 0.19';
    return match;
  });

  const deviceName = `${model} (${sourceTag})`;
  const singlePresetText = `Device: ${deviceName}\n${sanitizedContent}`;

  items.push({
    model,
    source,
    category,
    sourceTag,
    sourceGroup,
    deviceName,
    content: sanitizedContent,
    fullText: singlePresetText,
  });
}

// Sort alphabetically by device name
items.sort((a, b) => a.deviceName.localeCompare(b.deviceName, undefined, { sensitivity: 'base' }));

console.log(`Processing and parsing ${items.length} presets with CritEQ parsePEQ engine...`);

const allParsedPresets = [];
const crinacleItems = [];
const squiglinkItems = [];
const autoeqItems = [];

// Prepare directories
const iemBaseDir = path.join(targetPresetDir, 'IEM');
const crinacleDir = path.join(iemBaseDir, 'Crinacle');
const squiglinkDir = path.join(iemBaseDir, 'Squiglink');
const autoeqDir = path.join(iemBaseDir, 'AutoEq-Reference');

fs.mkdirSync(crinacleDir, { recursive: true });
fs.mkdirSync(squiglinkDir, { recursive: true });
fs.mkdirSync(autoeqDir, { recursive: true });

for (const item of items) {
  const parsed = parsePEQ(item.fullText);
  if (parsed.length > 0) {
    const p = parsed[0];
    allParsedPresets.push(p);
  }

  if (item.sourceGroup === 'Crinacle') {
    crinacleItems.push(item);
  } else if (item.sourceGroup === 'Squiglink') {
    squiglinkItems.push(item);
  } else {
    autoeqItems.push(item);
  }

  // Save individual .txt file
  const safeFilename = `${item.deviceName.replace(/[/\\?%*:|"<>]/g, '_')}.txt`;
  let targetFolder = autoeqDir;
  if (item.sourceGroup === 'Crinacle') {
    targetFolder = crinacleDir;
  } else if (item.sourceGroup === 'Squiglink') {
    const reviewerSubdir = path.join(squiglinkDir, item.source.replace(/[/\\?%*:|"<>]/g, '_'));
    if (!fs.existsSync(reviewerSubdir)) fs.mkdirSync(reviewerSubdir, { recursive: true });
    targetFolder = reviewerSubdir;
  } else {
    const sourceSubdir = path.join(autoeqDir, item.source.replace(/[/\\?%*:|"<>]/g, '_'));
    if (!fs.existsSync(sourceSubdir)) fs.mkdirSync(sourceSubdir, { recursive: true });
    targetFolder = sourceSubdir;
  }

  fs.writeFileSync(path.join(targetFolder, safeFilename), item.fullText + '\n', 'utf-8');
}

console.log(`Successfully verified and parsed ${allParsedPresets.length} presets!`);

// 1. Generate All-In-One Combined Text File
console.log('Writing "CritEQ - All IEM Presets (Combined).txt"...');
const allText = items.map((i) => i.fullText).join('\n\n') + '\n';
fs.writeFileSync(path.join(targetPresetDir, 'CritEQ - All IEM Presets (Combined).txt'), allText, 'utf-8');

// 2. Generate Grouped Combined Files
console.log('Writing grouped preset files...');
const crinacleText = crinacleItems.map((i) => i.fullText).join('\n\n') + '\n';
fs.writeFileSync(path.join(targetPresetDir, 'CritEQ - Crinacle All Presets.txt'), crinacleText, 'utf-8');

const squiglinkText = squiglinkItems.map((i) => i.fullText).join('\n\n') + '\n';
fs.writeFileSync(path.join(targetPresetDir, 'CritEQ - Squiglink Reviewers All Presets.txt'), squiglinkText, 'utf-8');

const autoeqText = autoeqItems.map((i) => i.fullText).join('\n\n') + '\n';
fs.writeFileSync(path.join(targetPresetDir, 'CritEQ - AutoEq & Reference All Presets.txt'), autoeqText, 'utf-8');

// 3. Write Full JSON Database
console.log('Writing updated "criteq-all-iem-presets.json"...');
fs.writeFileSync(
  path.join(targetPresetDir, 'criteq-all-iem-presets.json'),
  JSON.stringify(allParsedPresets, null, 2),
  'utf-8'
);

// 4. Generate Comprehensive Documentation (README.md)
console.log('Writing README.md index...');
let md = `# CritEQ Complete IEM Parametric EQ Preset Database\n\n`;
md += `Database komprehensif profil equalizer parametrik untuk **In-Ear Monitor (IEM) & Earbud** sedunia, bersumber dari **AutoEq**, **Crinacle**, dan seluruh reviewer terkemuka di **Squiglink**.\n\n`;
md += `Total Presets: **${items.length.toLocaleString()} Presets**\n\n`;
md += `### Ringkasan Koleksi & Sumber:\n`;
md += `1. **[Crinacle](https://crinacle.com)**: **${crinacleItems.length.toLocaleString()} presets** (IEC-711 & B&K 4620 high-res measurement couplers).\n`;
md += `2. **[Squiglink Reviewers](https://squig.link)**: **${squiglinkItems.length.toLocaleString()} presets** (Super* Review, ToneDeafMonk, Jaytiss, RikudouGoku, Harpo, Fahryst, Kazi, DHRME, kr0mka, freeryder05, Bakkwatan, Ted's Squig Hoard, Auriculares Argentina).\n`;
md += `3. **AutoEq & Reference Labs**: **${autoeqItems.length.toLocaleString()} presets** (oratory1990, Rtings, Innerfidelity, HypetheSonics, Hi End Portable, Headphone.com, Regan Cipher).\n\n`;
md += `### File Gabungan ("All-In-One") Siap Pakai:\n`;
md += `- **[\`CritEQ - All IEM Presets (Combined).txt\`](./CritEQ%20-%20All%20IEM%20Presets%20(Combined).txt)**: Semua ${items.length.toLocaleString()} preset IEM dalam 1 file.\n`;
md += `- **[\`CritEQ - Crinacle All Presets.txt\`](./CritEQ%20-%20Crinacle%20All%20Presets.txt)**: Khusus ${crinacleItems.length.toLocaleString()} preset dari database Crinacle.\n`;
md += `- **[\`CritEQ - Squiglink Reviewers All Presets.txt\`](./CritEQ%20-%20Squiglink%20Reviewers%20All%20Presets.txt)**: Khusus ${squiglinkItems.length.toLocaleString()} preset dari komunitas reviewer Squiglink.\n`;
md += `- **[\`CritEQ - AutoEq & Reference All Presets.txt\`](./CritEQ%20-%20AutoEq%20%26%20Reference%20All%20Presets.txt)**: Khusus ${autoeqItems.length.toLocaleString()} preset dari lab oratory1990 & Rtings.\n`;
md += `- **[\`criteq-all-iem-presets.json\`](./criteq-all-iem-presets.json)**: Seluruh database dalam format JSON native CritEQ.\n\n`;
md += `### Cara Menggunakan di CritEQ:\n`;
md += `1. Klik tombol **\`Import\`** di toolbar CritEQ.\n`;
md += `2. Pilih file gabungan **\`CritEQ - All IEM Presets (Combined).txt\`** (atau salah satu file per sumber di atas), atau telusuri folder **\`IEM/\`** untuk file satuan model favorit Anda.\n`;
md += `3. Semua preset langsung muncul di dropdown daftar preset CritEQ dan siap didengarkan!\n\n`;
md += `### Daftar Brand Populer yang Tersedia:\n`;

const brandNames = ['Moondrop', 'KZ', 'Truthear', 'Sennheiser', 'DUNU', '64 Audio', 'Thieaudio', 'Kiwi Ears', 'Sony', 'Tangzu', '7Hz', 'AFUL', 'QDC', 'Campfire Audio', 'Shure', 'Etymotic', 'Final Audio', 'Empire Ears', 'SeeAudio', 'Tanchjim', 'BQEYZ', 'TinHiFi'];
md += `| Brand | Jumlah Preset |\n| :--- | :---: |\n`;
for (const b of brandNames) {
  const count = items.filter((i) => i.deviceName.toLowerCase().includes(b.toLowerCase())).length;
  md += `| **${b}** | ${count} |\n`;
}

fs.writeFileSync(path.join(targetPresetDir, 'README.md'), md, 'utf-8');

console.log('--- Consolidation Complete! ---');
