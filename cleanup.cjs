const fs = require('fs');
const path = require('path');
const viewsDir = path.join(process.cwd(), 'views', 'admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.hbs'));

for (const f of files) {
  let filePath = path.join(viewsDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Remove {{!-- logout model --}} and the modal
  content = content.replace(/\{\{!-- logout model --\}\}[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, '');
  content = content.replace(/\{\{!-- logout model --\}\}[\s\S]*?<\/div>\s*<\/div>/g, '');
  
  // Remove <!-- Logout Modal --> and the modal
  content = content.replace(/<!-- Logout Modal -->[\s\S]*?<div class="mo?-overlay[^>]*>[\s\S]*?<\/div>\s*<\/div>/g, '');
  content = content.replace(/<!-- Logout Modal -->[\s\S]*?<div class="modal-overlay[^>]*>[\s\S]*?<\/div>\s*<\/div>/g, '');

  // Remove the old openLogoutModal / closeLogoutModal / toggleSidebar functions
  // from script blocks
  content = content.replace(/function openLogoutModal\(\) \{[\s\S]*?\}/g, '');
  content = content.replace(/function closeLogoutModal\(\) \{[\s\S]*?\}/g, '');
  content = content.replace(/function confirmLogout\(\) \{[\s\S]*?\}/g, '');
  content = content.replace(/function toggleSidebar\(\) \{[\s\S]*?\}/g, '');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Cleaned up ${f}`);
  }
}
