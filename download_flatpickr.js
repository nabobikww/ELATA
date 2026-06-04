const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'flatpickr');

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

const files = {
    'flatpickr.min.css': 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
    'airbnb.css': 'https://npmcdn.com/flatpickr/dist/themes/airbnb.css',
    'flatpickr.min.js': 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js',
    'uk.js': 'https://npmcdn.com/flatpickr/dist/l10n/uk.js'
};

function download(filename, url) {
    return new Promise((resolve, reject) => {
        const dest = path.join(dir, filename);
        const file = fs.createWriteStream(dest);
        
        console.log(`Downloading ${url} to ${dest}...`);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect, resolve against current URL
                const redirectUrl = new URL(response.headers.location, url).toString();
                download(filename, redirectUrl).then(resolve).catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log(`Successfully downloaded ${filename}`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    try {
        for (const [filename, url] of Object.entries(files)) {
            await download(filename, url);
        }
        console.log('All Flatpickr files downloaded successfully!');
    } catch (err) {
        console.error('Error downloading Flatpickr files:', err);
    }
}

main();
