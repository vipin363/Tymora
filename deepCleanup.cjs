const fs = require('fs');
const path = require('path');
const viewsDir = path.join(process.cwd(), 'views', 'admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.hbs'));

for (const f of files) {
  let filePath = path.join(viewsDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Remove the old logout modal HTML entirely.
 
  content = content.replace(/<!--\s*LOGOUT\s*MODAL.*?-->[\s\S]*?<div[^>]*id="logoutModal"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '');
  content = content.replace(/\{\{!--\s*logout\s*model\s*--\}\}[\s\S]*?<div[^>]*id="logoutModal"[^>]*>[\s\S]*?<\/div>\s*<\/div>(?:\s*<\/div>)?/gi, '');
  
  // Also just in case there's no comment:
  content = content.replace(/<div[^>]*id="logoutModal"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g, '');

  // 2. Remove JavaScript functions.

  content = content.replace(/function\s+openLogoutModal\s*\(\)\s*\{[\s\S]*?\}/g, '');
  content = content.replace(/function\s+closeLogoutModal\s*\(\)\s*\{[\s\S]*?\}/g, '');
  content = content.replace(/function\s+confirmLogout\s*\(\)\s*\{[\s\S]*?\}/g, '');
  content = content.replace(/function\s+toggleSidebar\s*\(\)\s*\{[\s\S]*?\}/g, '');

  // Remove empty script blocks left behind
  content = content.replace(/<script>\s*<\/script>/g, '');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Deep cleaned ${f}`);
  }
}
