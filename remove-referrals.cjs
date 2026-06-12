const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), 'views', 'admin');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.hbs'));
const regex = /<a[^>]*href="\/admin\/referrals"[^>]*>[\s\S]*?<\/a>/g;

let count = 0;
files.forEach(file => {
  const filePath = path.join(dir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  if (regex.test(content)) {
    const newContent = content.replace(regex, '');
    fs.writeFileSync(filePath, newContent);
    count++;
    console.log('Updated ' + file);
  }
});
console.log('Total files updated: ' + count);
