const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/papu/.gemini/antigravity/brain/ddc0f35a-1a4a-4b35-bd02-438100f4df43/.system_generated/logs/transcript_full.jsonl')
});

let latestMatch = null;

rl.on('line', (line) => {
    try {
        const data = JSON.parse(line);
        if (data.type === 'PLANNER_RESPONSE' && data.tool_calls) {
            for (const call of data.tool_calls) {
                if (call.name === 'replace_file_content' && call.arguments && call.arguments.TargetFile && call.arguments.TargetFile.includes('index.html')) {
                    // This was a replace, so it doesn't have the FULL file.
                }
            }
        }
        
        // Let's look for view_file output!
        if (data.type === 'PLANNER_RESPONSE' && data.content) {
            // It might not have the full file.
        }
        
        // Actually, just looking for any string containing "<!DOCTYPE html>" and "<html lang=\"th\">" in the logs.
        if (line.includes('<!DOCTYPE html>') && line.includes('<nav class=\\"navbar\\">') && line.length > 50000) {
            latestMatch = line;
        }
    } catch (e) {
    }
});

rl.on('close', () => {
    if(latestMatch) {
        fs.writeFileSync('d:/โปรเจคสภา/scratch/recovered.txt', latestMatch);
        console.log('Found it!');
    } else {
        console.log('Not found');
    }
});
