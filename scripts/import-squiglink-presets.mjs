import fs from 'fs';
import path from 'path';
import { parsePEQ } from '../dist/peq/peq-parser.js';

const sourceBaseDir = '/tmp/autoeq_test/results/Super Review';
const targetDir = '/Users/atha/Documents/Test/Preset';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const subdirs = ['in-ear', 'earbud'];
const iems = [];
const allParsedPresets = [];

for (const sub of subdirs) {
  const dirPath = path.join(sourceBaseDir, sub);
  if (!fs.existsSync(dirPath)) continue;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const iemName = ent.name;
    const iemDir = path.join(dirPath, iemName);
    const files = fs.readdirSync(iemDir);
    const peqFile = files.find((f) => f.endsWith('ParametricEQ.txt'));

    if (!peqFile) continue;

    const rawContent = fs.readFileSync(path.join(iemDir, peqFile), 'utf-8').trim();
    
    // Format content with explicit Device name
    let formattedContent = rawContent;
    if (!formattedContent.startsWith('Device:')) {
      formattedContent = `Device: ${iemName}\n${formattedContent}`;
    }

    // Sanitize filename for macOS filesystem
    const safeFilename = `${iemName.replace(/[/\\?%*:|"<>]/g, '_')}.txt`;
    const outPath = path.join(targetDir, safeFilename);
    fs.writeFileSync(outPath, formattedContent, 'utf-8');

    // Parse with CritEQ parser
    try {
      const parsed = parsePEQ(formattedContent);
      if (parsed.length > 0) {
        const p = parsed[0];
        allParsedPresets.push(p);
        iems.push({
          name: iemName,
          category: sub === 'in-ear' ? 'In-Ear Monitor' : 'Earbud',
          preamp: p.global,
          filterCount: p.bands.length,
          filename: safeFilename,
        });
      }
    } catch {
      // Fallback if parsing fails
      iems.push({
        name: iemName,
        category: sub === 'in-ear' ? 'In-Ear Monitor' : 'Earbud',
        preamp: 0,
        filterCount: 10,
        filename: safeFilename,
      });
    }
  }
}

// Sort alphabetically by name
iems.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

// Write criteq-all-iem-presets.json
const jsonPath = path.join(targetDir, 'criteq-all-iem-presets.json');
fs.writeFileSync(jsonPath, JSON.stringify(allParsedPresets, null, 2), 'utf-8');

// Write README.md index
let markdown = `# Squiglink IEM EQ Presets (Super* Review Database)\n\n`;
markdown += `Source: [squig.link](https://squig.link/) via AutoEq (Harman Target)\n\n`;
markdown += `Total Presets: **${iems.length}**\n\n`;
markdown += `Compatible with: **CritEQ**, **eqMac**, **Equalizer APO**, **Peace**, **Wavelet**, and any parametric EQ.\n\n`;
markdown += `## How to Use\n`;
markdown += `1. **In CritEQ:** Click \`Import\` in the top toolbar and select any \`.txt\` file or load \`criteq-all-iem-presets.json\`.\n`;
markdown += `2. **In Equalizer APO / Peace:** Place or open the \`.txt\` file directly in your config directory.\n\n`;
markdown += `## Presets Directory (A–Z)\n\n`;
markdown += `| Model | Category | Preamp | Filters | Preset File |\n`;
markdown += `| :--- | :--- | :---: | :---: | :--- |\n`;

for (const iem of iems) {
  markdown += `| **${iem.name}** | ${iem.category} | ${iem.preamp.toFixed(1)} dB | ${iem.filterCount} | [\`${iem.filename}\`](./${encodeURIComponent(iem.filename)}) |\n`;
}

fs.writeFileSync(path.join(targetDir, 'README.md'), markdown, 'utf-8');

console.log(`Successfully imported ${iems.length} IEM presets into ${targetDir}`);
