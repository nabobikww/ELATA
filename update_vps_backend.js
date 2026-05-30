// update_vps_backend.js
const { Client } = require('ssh2');
const path = require('path');

const connSettings = {
    host: '93.190.247.117',
    port: 22,
    username: 'root',
    password: 'Uuzn93xd4fgkIZdR'
};

const files = [
    { local: path.join(__dirname, 'api', 'data.js'), remote: '/var/www/elataaparts/api/data.js' },
    { local: path.join(__dirname, 'api', 'data-php.php'), remote: '/var/www/elataaparts/api/data-php.php' }
];

const ssh = new Client();

console.log('Connecting to VPS...');
ssh.on('ready', () => {
    console.log('Connected. Starting SFTP upload...');
    ssh.sftp((err, sftp) => {
        if (err) throw err;
        
        let done = 0;
        files.forEach(f => {
            sftp.fastPut(f.local, f.remote, (err) => {
                if (err) {
                    console.error(`Failed to upload ${f.local} -> ${f.remote}:`, err);
                    ssh.end();
                    return;
                }
                console.log(`✔ Uploaded ${path.basename(f.local)} successfully.`);
                done++;
                if (done === files.length) {
                    console.log('🎉 VPS BACKEND UPDATED SUCCESSFULLY!');
                    ssh.end();
                }
            });
        });
    });
}).connect(connSettings);
