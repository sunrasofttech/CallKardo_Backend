const fs = require('fs');
const html = fs.readFileSync('/Users/navneetgupta/.gemini/antigravity-ide/brain/317e12b4-65fc-4796-bb67-c4b17ac563d4/.system_generated/steps/819/content.md', 'utf8');
const match = html.match(/"body":\{([^}]+)\}/g);
if (match) {
  console.log('Body Matches:', match);
} else {
  // extract code blocks
  const codeBlocks = html.match(/<code[^>]*>.*?<\/code>/g);
  if (codeBlocks) {
    codeBlocks.forEach(b => {
      if (b.includes('POST') || b.includes('name')) {
        console.log(b.replace(/<[^>]+>/g, ''));
      }
    });
  }
}
