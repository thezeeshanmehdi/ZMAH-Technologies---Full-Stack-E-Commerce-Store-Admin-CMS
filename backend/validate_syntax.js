const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '../frontend');
const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

let errorFound = false;

for (const file of files) {
    const filePath = path.join(frontendDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptIdx = 0;
    while ((match = scriptRegex.exec(content)) !== null) {
        scriptIdx++;
        const code = match[1];
        try {
            new Function(code);
        } catch (e) {
            console.error(`Syntax Error in ${file} (Script #${scriptIdx}):`);
            console.error(e.message);
            errorFound = true;
        }
    }
}

if (!errorFound) {
    console.log("All scripts parsed successfully. No SyntaxErrors found.");
}
