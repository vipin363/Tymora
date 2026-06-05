const fs = require('fs');
const path = require('path');
const viewsDir = path.join(process.cwd(), 'views', 'admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.hbs'));

for (const f of files) {
  let filePath = path.join(viewsDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  // Replace <aside ... </aside>
  content = content.replace(/<aside class="sidebar"[^>]*>[\s\S]*?<\/aside>/, '{{> admin/sidebar}}');

  // Replace Logout Modal
  // It varies. It could be <div class="mo-overlay" id="logoutModal"...
  // Or <div class="modal-overlay" id="logoutModalOverlay"...
  // We'll replace both forms.
  content = content.replace(/<!-- Logout Modal -->[\s\S]*?<div class="m[a-z-]*overlay" id="logoutModal[^>]*>[\s\S]*?<\/div>\s*<\/div>/, '');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${f}`);
  }
}
