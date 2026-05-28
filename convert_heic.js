const fs = require('fs');
const path = require('path');

async function run() {
    try {
        console.log('Resolving heic-convert...');
        const convert = require('heic-convert');

        const deluxeDir = 'C:\\Users\\Nitro\\OneDrive\\Desktop\\ELATA\\rooms\\deluxe';
        const files = ['IMG_2354.HEIC', 'IMG_2355.HEIC'];

        for (const file of files) {
            const inputPath = path.join(deluxeDir, file);
            if (!fs.existsSync(inputPath)) {
                console.log(`File not found: ${inputPath}`);
                continue;
            }
            console.log(`Reading ${file}...`);
            const inputBuffer = fs.readFileSync(inputPath);
            
            console.log(`Converting ${file} to JPEG...`);
            const outputBuffer = await convert({
                buffer: inputBuffer, // the HEIC file buffer
                format: 'JPEG',      // output format
                quality: 0.85        // slightly higher quality
            });

            const outputName = file.replace('.HEIC', '.jpg');
            const outputPath = path.join(deluxeDir, outputName);
            fs.writeFileSync(outputPath, outputBuffer);
            console.log(`Successfully wrote ${outputName} to deluxe folder!`);
        }
        
        const premiumDir = 'C:\\Users\\Nitro\\OneDrive\\Desktop\\ELATA\\rooms\\two-room-premium';
        const premiumFiles = ['IMG_2377.HEIC', 'IMG_2378.HEIC'];
        for (const file of premiumFiles) {
            const inputPath = path.join(premiumDir, file);
            if (!fs.existsSync(inputPath)) {
                console.log(`File not found: ${inputPath}`);
                continue;
            }
            console.log(`Reading ${file}...`);
            const inputBuffer = fs.readFileSync(inputPath);
            
            console.log(`Converting ${file} to JPEG...`);
            const outputBuffer = await convert({
                buffer: inputBuffer,
                format: 'JPEG',
                quality: 0.85
            });

            const outputName = file.replace('.HEIC', '.jpg');
            const outputPath = path.join(premiumDir, outputName);
            fs.writeFileSync(outputPath, outputBuffer);
            console.log(`Successfully wrote ${outputName} to premium folder!`);
        }

    } catch (e) {
        console.error('Error occurred:', e);
    }
}

run();
