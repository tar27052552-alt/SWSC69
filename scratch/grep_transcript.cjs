const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/papu/.gemini/antigravity/brain/ddc0f35a-1a4a-4b35-bd02-438100f4df43/.system_generated/logs/transcript_full.jsonl')
});

let foundLines = [];

rl.on('line', (line) => {
    try {
        if (line.includes('border-right:') && line.includes('nav-item')) {
            foundLines.push(line);
        }
    } catch (e) {
    }
});

rl.on('close', () => {
    fs.writeFileSync('d:/โปรเจคสภา/scratch/grep_results.txt', foundLines.join('\n\n====\n\n'), 'utf8');
    console.log('Saved to grep_results.txt');
});
