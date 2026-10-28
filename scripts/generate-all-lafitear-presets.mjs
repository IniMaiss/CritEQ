/**
 * Generate AutoEq PEQ presets for all Lafitear IEM models from Squiglink.
 */

import fs from 'fs';
import path from 'path';
import { parsePEQ } from '../dist/peq/peq-parser.js';

const targetPresetDir = '/Users/atha/Documents/Test/Preset';

const lafitearSources = [
  { name: 'Lafitear LF1', reviewer: 'ianfann', url: 'https://squig.link/lab/ianfann/data/LAFITEAR%20LF1%20L.txt' },
  { name: 'Lafitear LT1', reviewer: 'ankramutt', url: 'https://squig.link/lab/ankramutt/data/Lafitear%20LT1%20L.txt' },
  { name: 'Lafitear LT2', reviewer: 'yoshiultra', url: 'https://squig.link/lab/yoshiultra/data/Lafitear%20LT2%20Set1%20AET16%20L.txt' },
  { name: 'Lafitear LF3', reviewer: 'awsmdanny', url: 'https://squig.link/lab/awsmdanny/data/Lafitear%20LF%203%20L.txt' },
  { name: 'Lafitear LF3 Pro', reviewer: 'ankramutt', url: 'https://squig.link/lab/ankramutt/data/Lafitear%20LF3%20Pro%20L.txt' },
  { name: 'Lafitear LF4', reviewer: 'soundignity', url: 'https://squig.link/lab/soundignity/data/LAFITEAR%20LF4%20L.txt' },
  { name: 'Lafitear LM3 Pro', reviewer: 'riz', url: 'https://squig.link/lab/riz/data/Lafitear%20LM3%20pro%20L.txt' },
  { name: 'Lafitear LV-C', reviewer: 'obodio', url: 'https://squig.link/lab/obodio/data/lvc%20L.txt' },
  { name: 'Lafitear 2DD', reviewer: 'bassyalexander', url: 'https://squig.link/lab/bassyalexander/data/Lafitear%202DD%20L.txt' },
  { name: 'Lafitear DLC', reviewer: 'bassyalexander', url: 'https://squig.link/lab/bassyalexander/data/Lafitear%20DLC%20L.txt' },
];

async function main() {
  console.log('Loading Squiglink Equalizer engine and Harman 2019 target...');
  const eqJsCode = await (await fetch('https://squig.link/lab/ianfann/equalizer.js')).text();
  const targetCsv = await (await fetch('https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/targets/Harman%20in-ear%202019.csv')).text();

  const targetLines = targetCsv.trim().split('\n').slice(1);
  const targetCurve = targetLines.map((l) => {
    const [f, v] = l.split(',');
    return [parseFloat(f), parseFloat(v)];
  });

  const fn = new Function(`${eqJsCode}; return Equalizer;`);
  const Equalizer = fn();
  const freqs = Equalizer.config.GraphicEQRawFrequences;
  const interpTarget = Equalizer.interp(freqs, targetCurve);
  const target1k = Equalizer.interp([1000], interpTarget)[0][1];
  const normTarget = interpTarget.map(([f, v]) => [f, v - target1k + 60]);

  const generatedPresets = [];

  for (const item of lafitearSources) {
    try {
      console.log(`Downloading and processing ${item.name} (${item.reviewer})...`);
      const res = await fetch(item.url);
      if (!res.ok) {
        console.warn(`Failed to fetch ${item.url}: status ${res.status}`);
        continue;
      }
      const rawText = await res.text();
      const rawLines = rawText.trim().split('\n').filter((l) => !l.startsWith('*') && (l.includes('\t') || l.includes(' ')));
      const rawCurve = [];
      for (const line of rawLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const f = parseFloat(parts[0]);
          const v = parseFloat(parts[1]);
          if (!isNaN(f) && !isNaN(v)) {
            rawCurve.push([f, v]);
          }
        }
      }

      if (rawCurve.length < 10) {
        console.warn(`Insufficient points for ${item.name}`);
        continue;
      }

      const interpRaw = Equalizer.interp(freqs, rawCurve);
      const raw1k = Equalizer.interp([1000], interpRaw)[0][1];
      const normRaw = interpRaw.map(([f, v]) => [f, v - raw1k + 60]);

      // Optimize 10 bands
      const filters = Equalizer.autoeq(normRaw, normTarget, 10);
      const eqRaw = Equalizer.apply(normRaw, filters);
      const calcPreamp = Equalizer.calc_preamp(normRaw, eqRaw);
      const preamp = (calcPreamp < 0 ? calcPreamp : 0).toFixed(1);

      const deviceName = `${item.name} (${item.reviewer})`;
      let peqLines = [`Device: ${deviceName}`, `Preamp: ${preamp} dB`];

      filters.forEach((f, idx) => {
        const qVal = Math.max(0.19, f.q);
        peqLines.push(`Filter ${idx + 1}: ON ${f.type} Fc ${Math.round(f.freq)} Hz Gain ${f.gain.toFixed(1)} dB Q ${qVal.toFixed(2)}`);
      });

      const fullText = peqLines.join('\n');
      // Validate with parsePEQ
      const parsed = parsePEQ(fullText);
      if (parsed.length > 0) {
        generatedPresets.push({
          model: item.name,
          deviceName,
          reviewer: item.reviewer,
          fullText,
          preset: parsed[0],
        });
        console.log(`✓ ${deviceName} successfully generated!`);
      }
    } catch (err) {
      console.error(`Error processing ${item.name}:`, err.message);
    }
  }

  // Also include the existing Lafitear LM1 and LM2
  const lm1Text = `Device: Lafitear LM1 (Harpo)
Preamp: -4.7 dB
Filter 1: ON LSC Fc 105 Hz Gain 2.5 dB Q 0.70
Filter 2: ON PK Fc 1613 Hz Gain 4.6 dB Q 0.59
Filter 3: ON PK Fc 143 Hz Gain -5.3 dB Q 0.43
Filter 4: ON PK Fc 690 Hz Gain 2.6 dB Q 1.41
Filter 5: ON PK Fc 5238 Hz Gain -2.5 dB Q 5.00
Filter 6: ON HSC Fc 10000 Hz Gain -2.6 dB Q 0.70
Filter 7: ON PK Fc 9594 Hz Gain -7.4 dB Q 1.85
Filter 8: ON PK Fc 6099 Hz Gain 3.5 dB Q 4.07
Filter 9: ON PK Fc 7752 Hz Gain -3.8 dB Q 4.25
Filter 10: ON PK Fc 3790 Hz Gain 2.7 dB Q 3.77`;

  const lm2Text = `Device: Lafitear LM2 (Harpo)
Preamp: -4.3 dB
Filter 1: ON LSC Fc 105 Hz Gain -0.5 dB Q 0.70
Filter 2: ON PK Fc 170 Hz Gain -5.8 dB Q 0.53
Filter 3: ON PK Fc 1798 Hz Gain 4.4 dB Q 0.55
Filter 4: ON PK Fc 718 Hz Gain 2.1 dB Q 1.29
Filter 5: ON PK Fc 2755 Hz Gain -2.6 dB Q 3.60
Filter 6: ON HSC Fc 10000 Hz Gain -2.7 dB Q 0.70
Filter 7: ON PK Fc 6460 Hz Gain 2.6 dB Q 5.92
Filter 8: ON PK Fc 5199 Hz Gain -2.4 dB Q 5.86
Filter 9: ON PK Fc 3946 Hz Gain 1.2 dB Q 4.17
Filter 10: ON PK Fc 40 Hz Gain -0.2 dB Q 1.89`;

  const allLafitear = [
    { deviceName: 'Lafitear LM1 (Harpo)', fullText: lm1Text, preset: parsePEQ(lm1Text)[0], reviewer: 'Harpo' },
    { deviceName: 'Lafitear LM2 (Harpo)', fullText: lm2Text, preset: parsePEQ(lm2Text)[0], reviewer: 'Harpo' },
    ...generatedPresets,
  ];

  allLafitear.sort((a, b) => a.deviceName.localeCompare(b.deviceName));

  console.log(`\nTotal Lafitear Presets: ${allLafitear.length}`);

  // 1. Write dedicated Lafitear - All Presets.txt
  const lafitearCombinedText = allLafitear.map((i) => i.fullText).join('\n\n') + '\n';
  fs.writeFileSync(path.join(targetPresetDir, 'CritEQ - Lafitear All Presets.txt'), lafitearCombinedText, 'utf-8');

  // 2. Save individual files in Preset/IEM/Lafitear
  const lafitearDir = path.join(targetPresetDir, 'IEM', 'Lafitear');
  fs.mkdirSync(lafitearDir, { recursive: true });
  for (const item of allLafitear) {
    const filename = `${item.deviceName.replace(/[/\\?%*:|"<>]/g, '_')}.txt`;
    fs.writeFileSync(path.join(lafitearDir, filename), item.fullText + '\n', 'utf-8');
  }

  // 3. Integrate into the main combined files and json database
  const combinedFile = path.join(targetPresetDir, 'CritEQ - All IEM Presets (Combined).txt');
  let combinedContent = fs.readFileSync(combinedFile, 'utf-8');
  for (const item of generatedPresets) {
    if (!combinedContent.includes(`Device: ${item.deviceName}`)) {
      combinedContent += `\n\n${item.fullText}`;
    }
  }
  fs.writeFileSync(combinedFile, combinedContent, 'utf-8');

  const squiglinkCombined = path.join(targetPresetDir, 'CritEQ - Squiglink Reviewers All Presets.txt');
  let squigContent = fs.readFileSync(squiglinkCombined, 'utf-8');
  for (const item of generatedPresets) {
    if (!squigContent.includes(`Device: ${item.deviceName}`)) {
      squigContent += `\n\n${item.fullText}`;
    }
  }
  fs.writeFileSync(squiglinkCombined, squigContent, 'utf-8');

  // Update JSON
  const jsonPath = path.join(targetPresetDir, 'criteq-all-iem-presets.json');
  const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const existingNames = new Set(existingJson.map((p) => p.name));
  for (const item of generatedPresets) {
    if (!existingNames.has(item.preset.name)) {
      existingJson.push(item.preset);
    }
  }
  fs.writeFileSync(jsonPath, JSON.stringify(existingJson, null, 2), 'utf-8');

  console.log('--- Lafitear Generation Complete! ---');
}

main().catch(console.error);
