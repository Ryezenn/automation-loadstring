const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multi-strategy Fetch Helper
async function fetchUrlContent(targetUrl) {
  let errors = [];

  // Strategy 1: Direct Fetch
  try {
    const response = await axios.get(targetUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/plain, text/html, application/json, */*'
      }
    });
    const content = typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : String(response.data);
    return { content, strategy: 'direct' };
  } catch (err) {
    errors.push(`Direct fetch: ${err.message}`);
  }

  // Strategy 2: Proxy Fallback (AllOrigins)
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const response = await axios.get(proxyUrl, { timeout: 8000 });
    if (response.data && typeof response.data.contents === 'string') {
      return { content: response.data.contents, strategy: 'allorigins' };
    }
  } catch (err) {
    errors.push(`AllOrigins Proxy: ${err.message}`);
  }

  // Strategy 3: Proxy Fallback (CorsProxy.io)
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const response = await axios.get(proxyUrl, { timeout: 8000 });
    const content = typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : String(response.data);
    return { content, strategy: 'corsproxy' };
  } catch (err) {
    errors.push(`CorsProxy.io: ${err.message}`);
  }

  // Throw error with troubleshooting details
  throw new Error(`Gagal mengambil konten dari URL. Detail error:\n- ${errors.join('\n- ')}\n\nSaran: Pastikan URL valid, server target aktif, atau gunakan URL raw alternatif (misal: raw.githubusercontent.com untuk file GitHub).`);
}

// Deep Secret Redaction & Detection
function scanAndRedactSecrets(text) {
  const warnings = [];
  let redactedText = text;

  // Regex patterns for secrets
  const secretPatterns = {
    'Discord Bot Token': /[a-zA-Z0-9_-]{24}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27}/g,
    'Discord Webhook URL': /https:\/\/discord(app)?\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g,
    'Google API Key': /AIza[0-9A-Za-z-_]{35}/g,
    'GitHub Personal Access Token': /ghp_[a-zA-Z0-9]{36}/g,
    'Generic API Key/Credentials': /(key|api_key|apikey|secret|password|passwd|token)\s*[:=]\s*(['"`])[a-zA-Z0-9_\-\.\@\#\$\%\^\&\*\(\)\+]{8,}\2/gi,
  };

  for (const [keyName, pattern] of Object.entries(secretPatterns)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      warnings.push(`Terdeteksi ${matches.length} kredensial sensitif (${keyName}). Kredensial telah disembunyikan.`);
      
      // If it's a key-value assignment, redact only the value part to keep structure
      if (keyName === 'Generic API Key/Credentials') {
        redactedText = redactedText.replace(pattern, (match) => {
          const separator = match.includes(':') ? ':' : '=';
          const parts = match.split(separator);
          const keyPart = parts[0];
          const quote = parts[1].trim().charAt(0);
          return `${keyPart}${separator} ${quote}[REDACTED]${quote}`;
        });
      } else {
        redactedText = redactedText.replace(pattern, '[REDACTED]');
      }
    }
  }

  return { redactedText, warnings };
}

// Obfuscation Analysis Helper
function detectObfuscation(text, language) {
  let score = 0; // 0 to 100 scale
  const indicators = [];

  if (!text || text.length < 20) return { detected: false, score: 0, indicators };

  // 1. Check for long hex arrays or string tables (common in Lua/JS obfuscators)
  const hexPatternCount = (text.match(/0x[0-9a-fA-F]+/g) || []).length;
  if (hexPatternCount > 20 && hexPatternCount / text.length > 0.02) {
    score += 35;
    indicators.push(`Kerapatan nilai hexadecimal sangat tinggi (${hexPatternCount} buah).`);
  }

  // 2. High density of backslashes or escape sequences (e.g. \123, \x50)
  const escapeCount = (text.match(/\\[xX][0-9a-fA-F]{2}/g) || []).length;
  const numEscapeCount = (text.match(/\\[0-9]{3}/g) || []).length;
  if (escapeCount > 20 || numEscapeCount > 20) {
    score += 40;
    indicators.push(`Menggunakan banyak urutan karakter lolos (escape sequences) (\\x atau \\num).`);
  }

  // 3. Obfuscator signatures
  if (text.includes('LPH|') || text.includes('IllIIlI') || text.includes('__LPH__') || text.includes('LuaObfuscator')) {
    score += 50;
    indicators.push('Terdeteksi tanda tangan (signature) LuaObfuscator / Luraph.');
  }
  if (text.includes('_0x') && (text.match(/_0x[0-9a-fA-F]+/g) || []).length > 15) {
    score += 45;
    indicators.push('Terdeteksi tanda tangan Javascript Obfuscator (_0x variabel).');
  }

  // 4. Entropy estimation (randomness of variable names)
  const lines = text.split('\n');
  const longLinesWithoutSpaces = lines.filter(l => l.length > 120 && !l.includes(' ') && !l.includes('\t')).length;
  if (longLinesWithoutSpaces > 3) {
    score += 25;
    indicators.push('Mengandung baris kode yang sangat panjang tanpa spasi (minified/obfuscated).');
  }

  const finalScore = Math.min(100, score);
  return {
    detected: finalScore >= 40,
    score: finalScore,
    indicators
  };
}

// JSON Path Resolver Helper
function resolveJsonPath(obj, pathString) {
  // e.g. "data.items[0].url"
  try {
    const parts = pathString.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '').split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  } catch (err) {
    return undefined;
  }
}

// Simple diffing helper (line-based)
function diffLines(text1, text2) {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');
  const diffResult = [];
  const maxLines = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLines; i++) {
    const l1 = lines1[i];
    const l2 = lines2[i];

    if (l1 === l2) {
      if (l1 !== undefined) {
        diffResult.push({ type: 'unchanged', text: l1, line: i + 1 });
      }
    } else {
      if (l1 !== undefined && l2 !== undefined) {
        diffResult.push({ type: 'removed', text: l1, lineNum1: i + 1 });
        diffResult.push({ type: 'added', text: l2, lineNum2: i + 1 });
      } else if (l1 !== undefined) {
        diffResult.push({ type: 'removed', text: l1, lineNum1: i + 1 });
      } else if (l2 !== undefined) {
        diffResult.push({ type: 'added', text: l2, lineNum2: i + 1 });
      }
    }
  }
  return diffResult;
}

// Recursive URL Inliner Helper for Lua scripts
async function inlineSubScriptsRecursive(code, visited = new Set()) {
  const urlRegex = /https?:\/\/[^\s"'`\(\)<>]+/g;
  let matches = [];
  
  // Find loadstring(game:HttpGet("...")) patterns
  const loadstringPattern = /loadstring\s*\(\s*game\s*:\s*HttpGet\s*\(\s*(["'])(https?:\/\/[^"'\)]+)\1\s*\)\s*\)\s*\(\s*\)/gi;
  let match;
  let modifiedCode = code;

  // Track urls to fetch
  const fetchPromises = [];
  const replacements = [];

  while ((match = loadstringPattern.exec(code)) !== null) {
    const fullMatch = match[0];
    const subUrl = match[2];

    if (!visited.has(subUrl)) {
      visited.add(subUrl);
      replacements.push({ fullMatch, subUrl });
      
      // Fetch concurrently
      fetchPromises.push(
        fetchUrlContent(subUrl)
          .then(res => ({ url: subUrl, content: res.content, success: true }))
          .catch(err => ({ url: subUrl, content: `-- Error fetching: ${err.message}`, success: false }))
      );
    }
  }

  if (fetchPromises.length === 0) {
    return modifiedCode;
  }

  const results = await Promise.all(fetchPromises);
  const resultsMap = new Map(results.map(r => [r.url, r.content]));

  for (const rep of replacements) {
    let subContent = resultsMap.get(rep.subUrl) || '';
    
    // Check if the subContent itself has nested scripts (recursive depth 1 layer further)
    if (subContent && !subContent.startsWith('-- Error')) {
      subContent = await inlineSubScriptsRecursive(subContent, visited);
    }

    modifiedCode = modifiedCode.replace(rep.fullMatch, `(function()\n${subContent}\nend)()`);
  }

  return modifiedCode;
}

// Language Detection
function detectLanguage(rawContent) {
  let language = 'Plain Text';
  const trimmedRaw = rawContent.trim();
  if (trimmedRaw.startsWith('{') || trimmedRaw.startsWith('[')) {
    try {
      JSON.parse(trimmedRaw);
      return 'JSON';
    } catch (e) {}
  }
  if (rawContent.includes('local ') && (rawContent.includes('then') || rawContent.includes('end')) && rawContent.includes('function')) {
    language = 'Lua';
  } else if ((rawContent.includes('const ') || rawContent.includes('let ') || rawContent.includes('var ')) && (rawContent.includes('=>') || rawContent.includes('console.log') || rawContent.includes('function'))) {
    language = 'JavaScript';
  } else if (rawContent.includes('def ') && rawContent.includes('import ') && (rawContent.includes('print(') || rawContent.includes('elif:'))) {
    language = 'Python';
  } else if (rawContent.includes('<?php') || (rawContent.includes('$this->') && rawContent.includes('public function'))) {
    language = 'PHP';
  } else if (rawContent.includes('<!DOCTYPE html>') || (rawContent.includes('<html') && rawContent.includes('</html>'))) {
    language = 'HTML';
  }
  return language;
}

// Main processing logic
app.post('/api/extract', async (req, res) => {
  const { url, mode = 'auto', format = 'summary', options = {} } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL target wajib diisi.' });
  }

  try {
    // 1. Fetch content
    const fetchResult = await fetchUrlContent(url);
    const rawContent = fetchResult.content;
    const fetchStrategy = fetchResult.strategy;

    // Detect Content Encoding
    let detectedEncoding = 'UTF-8';
    if (/^[A-Za-z0-9+/=\s\n]+$/.test(rawContent.trim()) && rawContent.length > 20 && rawContent.length % 4 === 0) {
      detectedEncoding = 'Base64 (Auto-detected)';
    } else if (/%[0-9a-fA-F]{2}/.test(rawContent)) {
      detectedEncoding = 'URL Encoded (Auto-detected)';
    } else if (/&[a-zA-Z0-9#]+;/.test(rawContent)) {
      detectedEncoding = 'HTML Entities (Auto-detected)';
    }

    // 2. Language Detection
    let language = detectLanguage(rawContent);

    // 3. Extract logic based on mode
    let extractedContent = rawContent;
    let extractionNotes = '';

    switch (mode) {
      case 'loadstring': {
        const matches = [];
        // Extract what is inside loadstring(...)
        const regex = /loadstring\s*\(([\s\S]*?)\)/gi;
        let match;
        while ((match = regex.exec(rawContent)) !== null) {
          matches.push(match[0]); // Keep full loadstring statement
        }
        
        if (matches.length > 0) {
          extractedContent = matches.join('\n\n');
          extractionNotes = `Ditemukan ${matches.length} pola loadstring(...) dalam konten.`;
        } else {
          extractedContent = '';
          extractionNotes = 'Tidak ditemukan pola loadstring(...) dalam konten.';
        }
        break;
      }

      case 'regex': {
        if (!options.regexPattern) {
          return res.status(400).json({ error: 'Pola regex (regexPattern) wajib diisi untuk mode regex.' });
        }
        try {
          const flags = options.regexFlags || 'gi';
          const customRegex = new RegExp(options.regexPattern, flags);
          const matches = rawContent.match(customRegex);
          if (matches) {
            extractedContent = matches.join('\n');
            extractionNotes = `Ditemukan ${matches.length} pencocokan menggunakan regex: /${options.regexPattern}/${flags}`;
          } else {
            extractedContent = '';
            extractionNotes = `Tidak ada kecocokan yang ditemukan untuk regex: /${options.regexPattern}/${flags}`;
          }
        } catch (e) {
          return res.status(400).json({ error: `Pola regex tidak valid: ${e.message}` });
        }
        break;
      }

      case 'between': {
        const { startMarker, endMarker } = options;
        if (!startMarker || !endMarker) {
          return res.status(400).json({ error: 'Parameter startMarker dan endMarker wajib diisi untuk mode between.' });
        }
        const startIdx = rawContent.indexOf(startMarker);
        if (startIdx !== -1) {
          const endIdx = rawContent.indexOf(endMarker, startIdx + startMarker.length);
          if (endIdx !== -1) {
            extractedContent = rawContent.substring(startIdx + startMarker.length, endIdx);
            extractionNotes = `Berhasil mengekstrak string di antara "${startMarker}" dan "${endMarker}".`;
          } else {
            extractedContent = '';
            extractionNotes = `Penanda akhir "${endMarker}" tidak ditemukan setelah penanda awal.`;
          }
        } else {
          extractedContent = '';
          extractionNotes = `Penanda awal "${startMarker}" tidak ditemukan dalam teks.`;
        }
        break;
      }

      case 'lines': {
        const startLine = parseInt(options.startLine) || 1;
        const endLine = parseInt(options.endLine) || 1;
        if (startLine < 1 || endLine < startLine) {
          return res.status(400).json({ error: 'Line range tidak valid. Pastikan startLine >= 1 dan endLine >= startLine.' });
        }
        const lines = rawContent.split(/\r?\n/);
        const slicedLines = lines.slice(startLine - 1, endLine);
        extractedContent = slicedLines.join('\n');
        extractionNotes = `Mengekstrak baris ${startLine} hingga baris ${endLine} (Total ${slicedLines.length} baris dari ${lines.length}).`;
        break;
      }

      case 'json_path': {
        if (!options.jsonPath) {
          return res.status(400).json({ error: 'Parameter jsonPath wajib diisi untuk mode json_path.' });
        }
        try {
          const parsedJson = JSON.parse(rawContent);
          const resolvedValue = resolveJsonPath(parsedJson, options.jsonPath);
          if (resolvedValue !== undefined) {
            extractedContent = typeof resolvedValue === 'object' ? JSON.stringify(resolvedValue, null, 2) : String(resolvedValue);
            extractionNotes = `Berhasil mengekstrak nilai untuk path: ${options.jsonPath}`;
          } else {
            extractedContent = '';
            extractionNotes = `Key path "${options.jsonPath}" tidak ditemukan dalam struktur JSON.`;
          }
        } catch (err) {
          return res.status(400).json({ error: `Gagal parse konten sebagai JSON: ${err.message}` });
        }
        break;
      }

      case 'base64_auto': {
        // 1. Is the whole string base64?
        const stripped = rawContent.replace(/\s/g, '');
        const isWholeBase64 = /^[A-Za-z0-9+/=]+$/.test(stripped) && stripped.length > 10 && stripped.length % 4 === 0;

        if (isWholeBase64) {
          try {
            extractedContent = Buffer.from(stripped, 'base64').toString('utf-8');
            extractionNotes = 'Seluruh konten terdeteksi sebagai Base64 dan berhasil didecode.';
          } catch (e) {
            extractionNotes = 'Gagal mendekode seluruh konten sebagai Base64.';
          }
        } else {
          // Look for base64 blocks inside
          const b64Regex = /[A-Za-z0-9+/]{30,}={0,2}/g;
          const blocks = rawContent.match(b64Regex) || [];
          const decodedBlocks = [];

          blocks.forEach((block, idx) => {
            try {
              const decoded = Buffer.from(block, 'base64').toString('utf-8');
              // Only keep printable strings
              if (/[\x20-\x7E\r\n\t]{10,}/.test(decoded)) {
                decodedBlocks.push(`[BLOK BASE64 #${idx + 1}]:\n${decoded}`);
              }
            } catch (err) {}
          });

          if (decodedBlocks.length > 0) {
            extractedContent = decodedBlocks.join('\n\n========================================\n\n');
            extractionNotes = `Ditemukan ${decodedBlocks.length} blok Base64 yang berhasil didecode.`;
          } else {
            extractedContent = '';
            extractionNotes = 'Tidak ditemukan blok Base64 valid di dalam teks.';
          }
        }
        break;
      }

      case 'obfuscation_detect': {
        const analysis = detectObfuscation(rawContent, language);
        if (analysis.detected) {
          extractedContent = rawContent;
          extractionNotes = `⚠️ OBFUSCATION DETECTED (Skor: ${analysis.score}/100)\n\nIndikator:\n- ${analysis.indicators.join('\n- ')}`;
        } else {
          extractedContent = rawContent;
          extractionNotes = `KODE BERSIH (Skor Obfuscation: ${analysis.score}/100). Tidak ada tanda obfuscation kuat terdeteksi.`;
        }
        break;
      }

      case 'auto':
      default: {
        // Auto-detect loadstrings in Lua
        if (language === 'Lua' && rawContent.includes('loadstring')) {
          const matches = [];
          const regex = /loadstring\s*\(([\s\S]*?)\)/gi;
          let match;
          while ((match = regex.exec(rawContent)) !== null) {
            matches.push(match[0]);
          }
          if (matches.length > 0) {
            extractedContent = matches.join('\n\n');
            extractionNotes = `[Auto] Mendeteksi skrip Lua dengan loadstring. Mengekstrak ${matches.length} loadstring.`;
            break;
          }
        }
        
        // Auto-detect JSON
        if (language === 'JSON') {
          extractionNotes = '[Auto] Mendeteksi konten JSON valid.';
          break;
        }

        // Auto-detect base64 block
        const stripped = rawContent.replace(/\s/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(stripped) && stripped.length > 40 && stripped.length % 4 === 0) {
          try {
            extractedContent = Buffer.from(stripped, 'base64').toString('utf-8');
            extractionNotes = '[Auto] Konten terdeteksi Base64 penuh, otomatis didecode.';
            break;
          } catch (e) {}
        }

        extractionNotes = '[Auto] Kembalikan seluruh konten (full extraction).';
        break;
      }
    }

    // Check if recursive script inlining is requested for Lua
    if (options.recursivelyInline === true && language === 'Lua') {
      const originalExtracted = extractedContent;
      try {
        extractedContent = await inlineSubScriptsRecursive(extractedContent);
        extractionNotes += ` (Modul eksternal/URL berantai berhasil digabungkan secara rekursif)`;
      } catch (inlineErr) {
        console.error('Error recursive inlining:', inlineErr);
      }
    }

    // 4. Secret Scan & Redact on the EXTRACTED content
    const secretScan = scanAndRedactSecrets(extractedContent);
    extractedContent = secretScan.redactedText;
    const securityWarnings = [...secretScan.warnings];

    // 5. Danger & Threat Analysis
    let isDangerous = false;
    if (language === 'Lua') {
      if (rawContent.includes('os.execute') || rawContent.includes('os.remove') || rawContent.includes('io.popen')) {
        securityWarnings.push('Menggunakan shell commands / modifikasi file sistem Lua (os.execute/io.popen).');
        isDangerous = true;
      }
    } else if (language === 'JavaScript') {
      if (rawContent.includes('eval(') || rawContent.includes('Function(') || rawContent.includes('child_process')) {
        securityWarnings.push('Menggunakan eksekusi string JavaScript dinamis (eval/Function/child_process).');
        isDangerous = true;
      }
    } else if (language === 'Python') {
      if (rawContent.includes('eval(') || rawContent.includes('exec(') || rawContent.includes('subprocess') || rawContent.includes('os.system')) {
        securityWarnings.push('Menggunakan eksekusi kode dinamis Python atau subprocess shell.');
        isDangerous = true;
      }
    }

    const obfuscationCheck = detectObfuscation(rawContent, language);
    if (obfuscationCheck.detected) {
      securityWarnings.push(`Kode terdeteksi mengalami obfuscation (Skor: ${obfuscationCheck.score}/100).`);
      isDangerous = true;
    }

    // 6. Statistics Calculation
    const chars = rawContent.length;
    const linesCount = rawContent.split(/\r?\n/).length;
    const wordsCount = rawContent.split(/\s+/).filter(w => w.length > 0).length;
    const sizeKb = (chars / 1024).toFixed(2);

    // 7. Metadata Extraction
    let author = 'Tidak diketahui';
    let version = 'Tidak diketahui';
    let date = 'Tidak diketahui';
    let commentHeader = '';

    // Extract comments at the start (lines starting with --, //, #)
    const lines = rawContent.split(/\r?\n/);
    const commentLines = [];
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i].trim();
      if (line.startsWith('--') || line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) {
        commentLines.push(line);
      } else if (line.startsWith('/*') || line.startsWith('<!--')) {
        // Multi-line block start
        commentLines.push(line);
      }
    }
    if (commentLines.length > 0) {
      commentHeader = commentLines.join('\n');
      
      // Look for indicators in comments
      const commentText = commentLines.join(' ');
      const authorMatch = commentText.match(/(author|by|creator|developer)\s*[:\-]?\s*([a-zA-Z0-9_\-\s]{3,20})/i);
      if (authorMatch) author = authorMatch[2].trim();

      const versionMatch = commentText.match(/(version|v)\s*[:\-]?\s*([0-9\.\-a-zA-Z]{3,10})/i);
      if (versionMatch) version = versionMatch[2].trim();

      const dateMatch = commentText.match(/(date|created|updated)\s*[:\-]?\s*([a-zA-Z0-9\s,\/\-]{6,25})/i);
      if (dateMatch) date = dateMatch[2].trim();
    }

    // 8. Generate Summary Heuristics
    let summaryText = '';
    if (language === 'JSON') {
      summaryText = `Dokumen JSON yang berisi data terstruktur dengan ${wordsCount} elemen kunci.`;
    } else if (language === 'Lua') {
      summaryText = `Skrip Lua yang memiliki ${linesCount} baris kode. ` + 
        (rawContent.includes('loadstring') ? 'Skrip ini memuat/mengeksekusi loadstring eksternal.' : 'Skrip ini berfungsi mengeksekusi logika pemrograman Lua.');
    } else if (language === 'JavaScript') {
      summaryText = `Skrip JavaScript (JS) dengan ${linesCount} baris kode. ` + 
        (rawContent.includes('require') || rawContent.includes('import') ? 'Mengimpor dependensi modul eksternal.' : 'Dijalankan sebagai kode scripting client-side/server-side.');
    } else if (language === 'Python') {
      summaryText = `Skrip Python dengan ${linesCount} baris kode. Menyediakan fungsi-fungsi runtime Python.`;
    } else {
      summaryText = `Dokumen teks mentah (${language}) berukuran ${sizeKb} KB dengan statistik standar.`;
    }

    // 9. Format response structure
    const responsePayload = {
      source: url,
      strategy: fetchStrategy,
      stats: {
        chars,
        lines: linesCount,
        words: wordsCount,
        size: sizeKb
      },
      encoding: detectedEncoding,
      language,
      isDangerous,
      warnings: securityWarnings.length > 0 ? securityWarnings : null,
      summary: summaryText,
      extractionNotes,
      metadata: {
        author,
        version,
        date,
        commentHeader: commentHeader || 'Tidak ada komentar header terdeteksi'
      },
      extractedContent,
      rawContent
    };

    // Format output styling if requested
    if (format === 'raw') {
      return res.type('text/plain').send(extractedContent);
    } else if (format === 'annotated') {
      let annotated = `-- StringHunter Extraction Annotation\n`;
      annotated += `-- SOURCE: ${url}\n`;
      annotated += `-- LANGUAGE: ${language}\n`;
      annotated += `-- WARNINGS: ${securityWarnings.join(', ') || 'None'}\n\n`;
      annotated += extractedContent;
      return res.type('text/plain').send(annotated);
    } else {
      // Return JSON standard API payload
      return res.json(responsePayload);
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

// Diff Endpoint
app.post('/api/diff', (req, res) => {
  const { text1, text2 } = req.body;
  if (text1 === undefined || text2 === undefined) {
    return res.status(400).json({ error: 'Parameter text1 dan text2 wajib dikirimkan.' });
  }
  const result = diffLines(text1, text2);
  res.json({ diff: result });
});

// Fallback HTML page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server StringHunter berjalan di http://localhost:${PORT}`);
});
