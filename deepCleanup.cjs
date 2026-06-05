const fs = require('fs');
const path = require('path');
const viewsDir = path.join(process.cwd(), 'views', 'admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.hbs'));

for (const f of files) {
  let filePath = path.join(viewsDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Remove the old logout modal HTML entirely.
  // Match any block that has id="logoutModal" and looks like a modal.
  // We'll match from `<div class="[^"]*overlay" id="logoutModal"` up to the matching `</div>` (which is tricky with regex, 
  // so we'll match up to `</div>\s*</div>\s*</div>` or whatever, or we can just use a simple string replacement).
  
  // A safer regex for the modal container:
  content = content.replace(/<!--\s*LOGOUT\s*MODAL.*?-->[\s\S]*?<div[^>]*id="logoutModal"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '');
  content = content.replace(/\{\{!--\s*logout\s*model\s*--\}\}[\s\S]*?<div[^>]*id="logoutModal"[^>]*>[\s\S]*?<\/div>\s*<\/div>(?:\s*<\/div>)?/gi, '');
  
  // Also just in case there's no comment:
  content = content.replace(/<div[^>]*id="logoutModal"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g, '');

  // 2. Remove JavaScript functions.
  // We can just replace the entire line containing these function names if they are one-liners,
  // or use a more forgiving regex.
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
