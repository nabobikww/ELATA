// deploy_vps.js
// Automation script to install and configure ELATA site and bot on Ubuntu 24.04 VPS
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const connSettings = {
    host: '93.190.247.117',
    port: 22,
    username: 'root',
    password: 'Uuzn93xd4fgkIZdR'
};

const domain = 'elataaparts.com';
const remoteDir = '/var/www/elataaparts';

// List of files to upload (recursive)
const localDir = __dirname;
const uploadExcludeList = [
    '.git',
    'node_modules',
    '.agent',
    '.vercel',
    'package-lock.json',
    'package.json',
    'deploy_vps.js',
    'download_flatpickr.js',
    '.gitignore',
    'README.md',
    'leaf_shadow.png',
    'vase_wheat.png',
    'ssh_inspect.js'
];

function getFilesToUpload(dir, baseDir = '') {
    let files = [];
    const list = fs.readdirSync(dir);
    for (const item of list) {
        if (uploadExcludeList.includes(item)) continue;
        const fullPath = path.join(dir, item);
        const relPath = baseDir ? path.join(baseDir, item) : item;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            files = files.concat(getFilesToUpload(fullPath, relPath));
        } else {
            // Exclude large unused raw assets from uploading
            const ext = path.extname(item).toLowerCase();
            if (['.heic', '.mov', '.pdf'].includes(ext)) {
                continue;
            }
            files.push({
                localPath: fullPath,
                remotePath: path.join(remoteDir, relPath).replace(/\\/g, '/')
            });
        }
    }
    return files;
}

const ssh = new Client();

console.log('Connecting to VPS via SSH...');
ssh.on('ready', () => {
    console.log('✔ Connected to VPS successfully.');
    
    // Step 1: Run shell setup commands
    console.log('Starting system environment setup...');
    runSSHCommands([
        // Update packages
        'apt-get update',
        
        // Install Nginx, PHP 8.3 and modules
        'apt-get install -y nginx php-fpm php-curl php-json php-xml php-mbstring php-zip',
        
        // Enable and start services
        'systemctl enable nginx',
        'systemctl start nginx',
        'systemctl enable php8.3-fpm',
        'systemctl start php8.3-fpm',
        
        // Clean old site files and directories
        `rm -rf ${remoteDir}`,
        `mkdir -p ${remoteDir}/api`,
        `mkdir -p ${remoteDir}/rooms`
    ], () => {
        // Step 2: Upload website files using SFTP
        console.log('Initializing SFTP file transfer...');
        ssh.sftp((err, sftp) => {
            if (err) {
                console.error('SFTP Error:', err);
                ssh.end();
                return;
            }
            
            const files = getFilesToUpload(localDir);
            let uploadedCount = 0;
            
            function uploadNext() {
                if (uploadedCount === files.length) {
                    console.log('✔ All files uploaded successfully.');
                    
                    // Step 3: Configure Nginx server block
                    console.log('Configuring Nginx server block...');
                    configureNginx(() => {
                        // Step 4: Run Certbot for SSL
                        console.log('Configuring Let\'s Encrypt SSL certificates...');
                        configureSSL(() => {
                            // Step 5: Update Telegram Webhook URL
                            console.log('Setting Telegram Bot Webhook...');
                            setTelegramWebhook(() => {
                                console.log('\n🎉 VPS DEPLOYMENT FINISHED SUCCESSFULLY!');
                                console.log(`👉 Your luxury site is live at: https://${domain}`);
                                console.log(`👉 Bot is active at: https://t.me/ElataAbot`);
                                ssh.end();
                            });
                        });
                    });
                    return;
                }
                
                const f = files[uploadedCount];
                const dirOfFile = path.dirname(f.remotePath);
                
                // Ensure remote directory exists
                sftp.mkdir(dirOfFile, { mode: '0755' }, () => {
                    // Ignore directory already exists error
                    sftp.fastPut(f.localPath, f.remotePath, (err) => {
                        if (err) {
                            console.error(`Failed to upload ${f.localPath} -> ${f.remotePath}:`, err);
                            ssh.end();
                            return;
                        }
                        uploadedCount++;
                        console.log(`[${uploadedCount}/${files.length}] Uploaded ${path.basename(f.localPath)}`);
                        uploadNext();
                    });
                });
            }
            
            uploadNext();
        });
    });
}).connect(connSettings);

function runSSHCommands(cmds, callback) {
    let index = 0;
    
    function execNext() {
        if (index === cmds.length) {
            callback();
            return;
        }
        
        const cmd = cmds[index];
        console.log(`Executing remote: ${cmd}`);
        
        ssh.exec(cmd, (err, stream) => {
            if (err) {
                console.error(`SSH Exec Error on cmd: ${cmd}`, err);
                ssh.end();
                return;
            }
            
            stream.on('close', (code) => {
                if (code !== 0 && !cmd.startsWith('rm') && !cmd.startsWith('mkdir')) {
                    console.warn(`⚠️ Warning: command "${cmd}" exited with code ${code}`);
                }
                index++;
                execNext();
            }).on('data', (data) => {
                process.stdout.write(data.toString());
            }).stderr.on('data', (data) => {
                process.stderr.write(data.toString());
            });
        });
    }
    
    execNext();
}

function configureNginx(callback) {
    const nginxConfig = `server {
    listen 80;
    listen [::]:80;
    server_name elataaparts.com www.elataaparts.com;
    
    # Redirect all HTTP traffic to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name elataaparts.com www.elataaparts.com;

    root ${remoteDir};
    index index.html;

    # SSL Certificates (Managed by Certbot but referenced directly)
    ssl_certificate /etc/letsencrypt/live/elataaparts.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/elataaparts.com/privkey.pem;

    # SSL Configuration Optimizations
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # OCSP Stapling (Speeds up SSL handshakes on mobile networks)
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/elataaparts.com/chain.pem;
    resolver 8.8.8.8 1.1.1.1 valid=300s;
    resolver_timeout 5s;


    # High-Performance Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_min_length 256;
    gzip_types
        application/atom+xml
        application/javascript
        application/json
        application/ld+json
        application/manifest+json
        application/rss+xml
        application/vnd.geo+json
        application/vnd.ms-fontobject
        application/x-font-ttf
        application/x-web-app-manifest+json
        application/xhtml+xml
        application/xml
        font/opentype
        image/bmp
        image/svg+xml
        image/x-icon
        text/cache-manifest
        text/css
        text/plain
        text/vcard
        text/vnd.rim.location.code
        text/vtt
        text/x-component
        text/x-cross-domain-policy;

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Main Location
    location / {
        try_files $uri $uri/ =404;
    }

    # API configuration
    location = /api/data {
        include fastcgi_params;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME ${remoteDir}/api/data-php.php;
    }

    # PHP scripts fallback
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
    }

    # Browser Cache-Control Headers for Static Files (Speed up returning loads to 0 seconds)
    location ~* \\.(?:css|js|webp|png|jpg|jpeg|gif|ico|svg|mp4|mov|otf|ttf|woff|woff2|pdf)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }
}`;

    const tempFile = path.join(__dirname, 'nginx_temp.conf');
    fs.writeFileSync(tempFile, nginxConfig);
    
    ssh.sftp((err, sftp) => {
        if (err) {
            console.error(err);
            ssh.end();
            return;
        }
        
        sftp.fastPut(tempFile, '/etc/nginx/sites-available/elataaparts', (err) => {
            fs.unlinkSync(tempFile);
            if (err) {
                console.error('Failed to upload Nginx config:', err);
                ssh.end();
                return;
            }
            
            runSSHCommands([
                'ln -sf /etc/nginx/sites-available/elataaparts /etc/nginx/sites-enabled/elataaparts',
                'rm -f /etc/nginx/sites-enabled/default',
                'chown -R www-data:www-data /var/www/elataaparts',
                'nginx -t',
                'systemctl reload nginx'
            ], callback);
        });
    });
}

function configureSSL(callback) {
    // Install Certbot and obtain Let's Encrypt certificate
    runSSHCommands([
        'apt-get install -y certbot python3-certbot-nginx',
        `certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos -m contact@${domain} --redirect`
    ], (err) => {
        // If www or dual domain certbot fails, try single domain as fallback
        if (err) {
            console.log('Dual domain SSL failed. Trying single domain fallback...');
            runSSHCommands([
                `certbot --nginx -d ${domain} --non-interactive --agree-tos -m contact@${domain} --redirect`
            ], callback);
        } else {
            callback();
        }
    });
}

async function setTelegramWebhook(callback) {
    const TG_BOT_TOKEN = '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    const webhookUrl = `https://${domain}/api/data`;
    const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    
    console.log(`Calling Telegram setWebhook URL: ${tgUrl}`);
    
    try {
        const response = await fetch(tgUrl);
        const resJson = await response.json();
        console.log('Telegram Webhook set response:', resJson);
        callback();
    } catch (e) {
        console.error('Failed to set Telegram webhook via fetch:', e);
        // Try curl from the VPS as a backup
        runSSHCommands([
            `curl -s "https://api.telegram.org/bot${TG_BOT_TOKEN}/setWebhook?url=${webhookUrl}"`
        ], callback);
    }
}
