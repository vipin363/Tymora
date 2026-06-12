const fs = require('fs');
let content = fs.readFileSync('controller/userController.js', 'utf8');

const startStr = '    const activeCategoryIds = await Product.distinct("category", {';
const endStr = '          categories: navCategories,\n        });';

const startIdx = content.indexOf(startStr, content.indexOf('export const homePage')); 

if (startIdx !== -1) {
    const endIdx = content.indexOf(endStr, startIdx);
    if (endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx + endStr.length);
        fs.writeFileSync('controller/userController.js', content);
        console.log('Fixed');
    } else {
        console.log('End not found');
    }
} else {
    console.log('Start not found');
}
