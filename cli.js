const readline = require('readline');
const axios = require('axios');

// Helper to ask questions in CLI
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

// --------------------------------------------------------
// STEP 1: Fetch content using multiple strategies
// --------------------------------------------------------
async function fetchUrlContent(targetUrl) {
  const errors = [];

  // Strategy 1: Direct fetch
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
    errors.push(`Direct Fetch: ${err.message}`);
  }

  // Strategy 2: Proxy 1 (AllOrigins)
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const response = await axios.get(proxyUrl, { timeout: 8000 });
    if (response.data && typeof response.data.contents === 'string') {
      return { content: response.data.contents, strategy: 'allorigins' };
    }
  } catch (err) {
    errors.push(`AllOrigins Proxy: ${err.message}`);
  }

  // Strategy 3: Proxy 2 (CorsProxy.io)
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const response = await axios.get(proxyUrl, { timeout: 8000 });
    const content = typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : String(response.data);
    return { content, strategy: 'corsproxy' };
  } catch (err) {
    errors.push(`CorsProxy: ${err.message}`);
  }

  // Strategy 4: Proxy 3 (ThingProxy)
  try {
    const proxyUrl = `https://thingproxy.freeboard.io/fetch/${targetUrl}`;
    const response = await axios.get(proxyUrl, { timeout: 8000 });
    const content = typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : String(response.data);
    return { content, strategy: 'thingproxy' };
  } catch (err) {
    errors.push(`ThingProxy: ${err.message}`);
  }

  throw new Error(`Gagal mengambil konten dari URL. Semua strategi gagal.\nDetail:\n- ${errors.join('\n- ')}`);
}

// --------------------------------------------------------
// DECODER HELPERS (Pola 5: string.char, hex, base64)
// --------------------------------------------------------
function decodeStringChar(text) {
  // Matches string.char(104, 101, 108, 108, 111)
  const pattern = /string\.char\s*\(\s*([0-9\s,]+)\s*\)/gi;
  return text.replace(pattern, (match, numsStr) => {
    const chars = numsStr.split(',').map(n => String.fromCharCode(parseInt(n.trim(), 10)));
    return '"' + chars.join('') + '"';
  });
}

function decodeHexEscapes(text) {
  // Matches hex sequences like \x68\x65\x6c\x6c\x6f
  const pattern = /(\\x[0-9a-fA-F]{2})+/g;
  return text.replace(pattern, (match) => {
    try {
      const hexes = match.split('\\x').filter(Boolean);
      const chars = hexes.map(h => String.fromCharCode(parseInt(h, 16)));
      return chars.join('');
    } catch (e) {
      return match;
    }
  });
}

function decodeBase64Text(text) {
  // If the whole text looks like base64, decode it
  const stripped = text.trim();
  if (/^[A-Za-z0-9+/=]+$/.test(stripped) && stripped.length > 20 && stripped.length % 4 === 0) {
    try {
      return Buffer.from(stripped, 'base64').toString('utf8');
    } catch (e) {}
  }
  return text;
}

// --------------------------------------------------------
// STEP 2: Extract loadstrings & handle variable concats (Pola 4)
// --------------------------------------------------------
function extractLoadstrings(rawContent) {
  let content = rawContent;

  // Pre-process: Decode some basic obfuscations first to normalize
  content = decodeStringChar(content);
  content = decodeHexEscapes(content);

  const foundLoadstrings = [];

  // Pola 4: Variable concatenation extractor
  // e.g. local a = "foo"; local b = "bar"; loadstring(a..b)()
  const varAssignments = {};
  const assignRegex = /(?:local\s+)?(\w+)\s*=\s*(["'`])([\s\S]*?)\2/gi;
  let assignMatch;
  while ((assignMatch = assignRegex.exec(content)) !== null) {
    varAssignments[assignMatch[1]] = assignMatch[3];
  }
  // Alternate: block string local a = [[foo]]
  const blockAssignRegex = /(?:local\s+)?(\w+)\s*=\s*\[\[([\s\S]*?)\]\]/gi;
  while ((assignMatch = blockAssignRegex.exec(content)) !== null) {
    varAssignments[assignMatch[1]] = assignMatch[2];
  }

  // Helper to resolve concatenated variables like a..b..c
  function resolveConcats(expr) {
    const parts = expr.split(/\.\./).map(p => p.trim());
    let resolvedAll = true;
    const resolvedParts = parts.map(part => {
      if (varAssignments[part] !== undefined) {
        return varAssignments[part];
      }
      // If it is a literal string
      if ((part.startsWith('"') && part.endsWith('"')) || 
          (part.startsWith("'") && part.endsWith("'")) ||
          (part.startsWith('[[') && part.endsWith(']]'))) {
        return part.slice(1, -1);
      }
      resolvedAll = false;
      return part;
    });
    return resolvedAll ? resolvedParts.join('') : null;
  }

  // Pola 1: Standard loadstring(...)
  // Pola 3: loadstring(game:HttpGet("..."))
  const loadstringRegex = /loadstring\s*\(\s*([\s\S]*?)\s*\)/gi;
  let match;
  while ((match = loadstringRegex.exec(content)) !== null) {
    const inner = match[1].trim();

    // Check if the inner content is variable concatenation (Pola 4)
    if (inner.includes('..')) {
      const resolved = resolveConcats(inner);
      if (resolved) {
        // If the resolved concat contains a game:HttpGet/loadstring inside it, we parse it
        foundLoadstrings.push(resolved);
        continue;
      }
    }

    // Check if it's loadstring(game:HttpGet("..."))
    const httpGetRegex = /(?:game|game\.HttpService)[:\.]HttpGet\s*\(\s*(["'`])([\s\S]*?)\1\s*\)/i;
    const httpGetMatch = inner.match(httpGetRegex);
    if (httpGetMatch) {
      let url = httpGetMatch[2];
      // Check if URL inside HttpGet is base64 encoded (Pola 3)
      if (/^[A-Za-z0-9+/=]+$/.test(url) && url.length > 20) {
        try {
          url = Buffer.from(url, 'base64').toString('utf8');
        } catch (e) {}
      }
      foundLoadstrings.push(`loadstring(game:HttpGet("${url}"))()`);
    } else {
      foundLoadstrings.push(match[0]);
    }
  }

  // Pola 2: game:HttpGet("...") or game.HttpService:GetAsync("...") outside loadstring
  const standaloneHttpGetRegex = /(?:game|game\.HttpService)[:\.]HttpGet(?:Async)?\s*\(\s*(["'`])([\s\S]*?)\1\s*\)/gi;
  while ((match = standaloneHttpGetRegex.exec(content)) !== null) {
    foundLoadstrings.push(match[0]);
  }
  const getAsyncRegex = /(?:game|game\.HttpService)[:\.]GetAsync\s*\(\s*(["'`])([\s\S]*?)\1\s*\)/gi;
  while ((match = getAsyncRegex.exec(content)) !== null) {
    foundLoadstrings.push(match[0]);
  }

  // If no loadstring pattern matched but we have content, let's see if the page is a raw script itself
  if (foundLoadstrings.length === 0) {
    // Check if content looks like code (e.g. contains local, function, end)
    if (content.includes('local ') || content.includes('function') || content.includes('require')) {
      foundLoadstrings.push(content.trim());
    }
  }

  return foundLoadstrings;
}

// --------------------------------------------------------
// STEP 4: Scan and Redact Secrets
// --------------------------------------------------------
function scanAndRedactSecrets(text) {
  const warnings = [];
  let redactedText = text;

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

// Obfuscation Detector
function checkObfuscation(text) {
  let score = 0;
  const indicators = [];

  const hexCount = (text.match(/0x[0-9a-fA-F]+/g) || []).length;
  if (hexCount > 20 && hexCount / text.length > 0.02) {
    score += 35;
    indicators.push(`Kerapatan nilai hexadecimal sangat tinggi (${hexCount} buah).`);
  }

  const escapeCount = (text.match(/\\[xX][0-9a-fA-F]{2}/g) || []).length;
  const numEscapeCount = (text.match(/\\[0-9]{3}/g) || []).length;
  if (escapeCount > 20 || numEscapeCount > 20) {
    score += 40;
    indicators.push(`Menggunakan banyak escape sequences (\\x atau \\num).`);
  }

  if (text.includes('LPH|') || text.includes('IllIIlI') || text.includes('__LPH__') || text.includes('LuaObfuscator')) {
    score += 50;
    indicators.push('Terdeteksi signature LuaObfuscator / Luraph.');
  }

  return { detected: score >= 40, score, indicators };
}

// Extract any nested/chained URLs inside loadstring text
function extractNestedUrls(text, isHtml = false) {
  const urlRegex = /https?:\/\/[^\s"'`\(\)<>]+/g;
  const rawUrls = text.match(urlRegex) || [];
  
  // Filter list for common ads, scripts, CDNs, assets
  const ignorePatterns = [
    /google/i,
    /googlesyndication/i,
    /googletagmanager/i,
    /google-analytics/i,
    /w\.org/i,
    /litespeed/i,
    /wordpress/i,
    /wp-content/i,
    /wp-includes/i,
    /schema\.org/i,
    /w3\.org/i,
    /xmlrpc/i,
    /github\.com\/[^\/]+\/[^\/]+\/?$/i, // exclude generic github repo homepage
    /\.(css|png|jpg|jpeg|gif|svg|woff2?|json|ico)/i
  ];

  const filteredUrls = [];
  
  // If the page is HTML, let's look for anchors that point to scripts or downloads
  if (isHtml) {
    // Look for links with href
    const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(text)) !== null) {
      const href = match[1];
      // Check if it matches script-like targets
      if (href.includes('script') || href.includes('pastebin') || href.includes('github') || href.includes('raw') || href.includes('download')) {
        if (!ignorePatterns.some(p => p.test(href))) {
          if (!filteredUrls.includes(href)) {
            filteredUrls.push(href);
          }
        }
      }
    }
  }

  // Also parse general URLs found in the text
  rawUrls.forEach(url => {
    // Decode HTML entities if any
    const decodedUrl = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const isIgnored = ignorePatterns.some(p => p.test(decodedUrl));
    if (!isIgnored && !filteredUrls.includes(decodedUrl)) {
      filteredUrls.push(decodedUrl);
    }
  });

  return filteredUrls;
}

// --------------------------------------------------------
// PROCESS URL FLOW (Recursive)
// --------------------------------------------------------
async function processUrl(url) {
  console.log(`\n⏳ Mengambil konten dari: ${url}...`);
  
  let fetchResult;
  try {
    fetchResult = await fetchUrlContent(url);
  } catch (err) {
    console.log(`❌ Gagal mengambil URL: ${err.message}`);
    return;
  }

  const rawBody = fetchResult.content;
  const strategy = fetchResult.strategy;
  
  // Clean/Normalize base64 body if the entire page is base64
  const normalizedBody = decodeBase64Text(rawBody);

  // Extract loadstrings
  const scripts = extractLoadstrings(normalizedBody);

  // Stats calculation
  const chars = normalizedBody.length;
  const lines = normalizedBody.split(/\r?\n/).length;
  const sizeKb = (chars / 1024).toFixed(2);

  // Encoding & Language
  let encoding = 'UTF-8';
  if (normalizedBody !== rawBody) {
    encoding = 'Base64 (Auto-decoded)';
  } else if (/%[0-9a-fA-F]{2}/.test(rawBody)) {
    encoding = 'URL Encoded';
  }

  const isHtmlPage = /<!DOCTYPE html>/i.test(normalizedBody) || /<html/i.test(normalizedBody);
  let language = isHtmlPage ? 'HTML' : 'Plain Text';
  if (!isHtmlPage) {
    if (normalizedBody.includes('local ') && normalizedBody.includes('end')) {
      language = 'Lua';
    } else if (normalizedBody.includes('const ') || normalizedBody.includes('function')) {
      language = 'JavaScript';
    }
  }

  // Security Check
  const security = scanAndRedactSecrets(normalizedBody);
  const obf = checkObfuscation(normalizedBody);
  
  const warnings = [...security.warnings];
  if (obf.detected) {
    warnings.push(`Kode terdeteksi obfuscated (Skor: ${obf.score}/100) - ${obf.indicators.join(', ')}`);
  }

  // --------------------------------------------------------
  // STEP 3: Display Results
  // --------------------------------------------------------
  console.log('\n📥 SUMBER   :', url);
  console.log(`📊 STATISTIK: ${chars} karakter | ${lines} baris | ${sizeKb} KB`);
  console.log('🔤 ENCODING :', encoding);
  console.log('💻 BAHASA   :', language);
  console.log('⚠️  PERINGATAN:', warnings.join('; ') || 'Tidak ada');
  console.log('📝 RINGKASAN: Skrip berhasil diurai.');
  console.log('🔄 STRATEGI :', strategy.toUpperCase());

  console.log('\n============================');
  console.log(' LOADSTRING BERHASIL DIAMBIL');
  console.log('============================');
  console.log(`Sumber  : ${url}`);
  console.log(`Jumlah  : ${scripts.length} loadstring/script ditemukan`);
  console.log(`Ukuran  : ${chars} karakter`);
  
  scripts.forEach((script, idx) => {
    // Redact secrets in output script
    const redactedScript = scanAndRedactSecrets(script).redactedText;
    console.log(`\n--- #${idx + 1} ---`);
    console.log(redactedScript);
  });
  console.log('\n============================\n');

  // STEP 5: Recursive Chained Fetch Check
  const nestedUrls = [];
  
  // Find chained URLs inside scripts
  scripts.forEach(script => {
    const urls = extractNestedUrls(script, false);
    urls.forEach(u => {
      if (u !== url && !nestedUrls.includes(u)) {
        nestedUrls.push(u);
      }
    });
  });

  // If it is an HTML page, also extract potential script/redirect links
  if (isHtmlPage) {
    const htmlUrls = extractNestedUrls(normalizedBody, true);
    htmlUrls.forEach(u => {
      if (u !== url && !nestedUrls.includes(u)) {
        nestedUrls.push(u);
      }
    });
  }

  for (const nextUrl of nestedUrls) {
    const answer = await askQuestion(`⚠️ Ditemukan URL berantai: ${nextUrl}\n👉 Mau diambil juga? (y/n): `);
    if (answer.trim().toLowerCase() === 'y') {
      await processUrl(nextUrl);
    }
  }
}

// --------------------------------------------------------
// CLI Entry Point
// --------------------------------------------------------
async function main() {
  const urlArg = process.argv[2];
  if (!urlArg) {
    console.log('StringHunter CLI v2.0 - Pengambil Loadstring Otomatis');
    console.log('Penggunaan: node cli.js <URL>');
    const inputUrl = await askQuestion('\nMasukkan URL target: ');
    if (inputUrl.trim()) {
      await processUrl(inputUrl.trim());
    }
  } else {
    await processUrl(urlArg.trim());
  }
  console.log('Terima kasih telah menggunakan StringHunter CLI!');
}

main();
