const fs = require('fs');
const html = fs.readFileSync('/Users/navneetgupta/.gemini/antigravity-ide/brain/317e12b4-65fc-4796-bb67-c4b17ac563d4/.system_generated/steps/819/content.md', 'utf8');

const regex = /"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"/g;
let match;
while ((match = regex.exec(html)) !== null) {
  console.log(`Field: ${match[1]}, Type: ${match[2]}`);
}
