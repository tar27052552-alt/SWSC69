const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/papu/.gemini/antigravity/brain/ddc0f35a-1a4a-4b35-bd02-438100f4df43/.system_generated/logs/transcript_full.jsonl')
});

rl.on('line', (line) => {
    try {
        const data = JSON.parse(line);
        if (data.step_index === 2156) {
            fs.writeFileSync('d:/โปรเจคสภา/scratch/step2156.json', JSON.stringify(data, null, 2));
            console.log('Saved step 2156');
        }
    } catch (e) {
    }
});
