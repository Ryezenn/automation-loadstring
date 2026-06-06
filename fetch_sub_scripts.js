const fs = require('fs');

const subUrls = {
  fixLag: 'https://raw.githubusercontent.com/hdanhhub/hdanhhub/refs/heads/main/Fix-Lag.lua.txt',
  uiTay: 'https://raw.githubusercontent.com/VTDROBLOX/Animehub/refs/heads/main/ui_tay.txt',
  notify: 'https://raw.githubusercontent.com/Teddyseetink/Haidepzai/refs/heads/main/notify'
};

async function fetchSub(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return `-- Failed to fetch ${url}\n`;
    return await res.text();
  } catch (e) {
    return `-- Error fetching ${url}: ${e.message}\n`;
  }
}

async function merge() {
  console.log('Fetching sub-scripts...');
  const fixLagCode = await fetchSub(subUrls.fixLag);
  const uiTayCode = await fetchSub(subUrls.uiTay);
  const notifyCode = await fetchSub(subUrls.notify);

  console.log('Sub-scripts fetched successfully.');
  
  // Read main SkullHub.lua
  let mainCode = fs.readFileSync('SkullHub.lua', 'utf8');

  // Replace loadstrings with direct inlined code
  // 1. Replace Fix-Lag
  const fixLagPattern = /loadstring\s*\(\s*game\s*:\s*HttpGet\s*\(\s*["']https:\/\/raw\.githubusercontent\.com\/hdanhhub\/hdanhhub\/refs\/heads\/main\/Fix-Lag\.lua\.txt["']\s*\)\s*\)\s*\(\s*\)/gi;
  mainCode = mainCode.replace(fixLagPattern, () => {
    return `(function()\n${fixLagCode}\nend)()`;
  });

  // 2. Replace ui_tay
  const uiTayPattern = /loadstring\s*\(\s*game\s*:\s*HttpGet\s*\(\s*["']https:\/\/raw\.githubusercontent\.com\/VTDROBLOX\/Animehub\/refs\/heads\/main\/ui_tay\.txt["']\s*\)\s*\)\s*\(\s*\)/gi;
  mainCode = mainCode.replace(uiTayPattern, () => {
    return `(function()\n${uiTayCode}\nend)()`;
  });

  // 3. Replace notify
  const notifyPattern = /loadstring\s*\(\s*game\s*:\s*HttpGet\s*\(\s*["']https:\/\/raw\.githubusercontent\.com\/Teddyseetink\/Haidepzai\/refs\/heads\/main\/notify["']\s*\)\s*\)\s*\(\s*\)/gi;
  mainCode = mainCode.replace(notifyPattern, () => {
    return `(function()\n${notifyCode}\nend)()`;
  });

  // Also replace any standalone HttpGet calls if needed, but inlining them as loadstrings is the main execution path.

  fs.writeFileSync('SkullHub_merged.lua', mainCode, 'utf8');
  console.log('SUCCESS: Saved merged script to SkullHub_merged.lua');
  console.log('Merged length:', mainCode.length);
}

merge();
