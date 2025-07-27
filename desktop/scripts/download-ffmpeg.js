const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Configuration des URLs pour télécharger FFmpeg
const FFMPEG_URLS = {
    'windows': {
        'x64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
        'ia32': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win32-gpl.zip'
    },
    'linux': {
        'x64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
        'arm64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz'
    }
};

const BINARIES_DIR = path.join(__dirname, '..', 'binaries');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const fileName = path.basename(dest);
        
        console.log(`📥 Downloading: ${fileName}`);
        console.log(`🔗 URL: ${url}`);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                console.log(`🔄 Redirecting to: ${response.headers.location}`);
                file.destroy();
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedSize = 0;
            let lastPercent = 0;
            
            if (totalSize > 0) {
                console.log(`📊 File size: ${formatBytes(totalSize)}`);
            }
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                
                if (totalSize > 0) {
                    const percent = Math.floor((downloadedSize / totalSize) * 100);
                    if (percent !== lastPercent && percent % 10 === 0) {
                        const progress = '█'.repeat(percent / 5) + '░'.repeat(20 - percent / 5);
                        console.log(`⏳ Progress: [${progress}] ${percent}% (${formatBytes(downloadedSize)}/${formatBytes(totalSize)})`);
                        lastPercent = percent;
                    }
                }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`✅ Download completed: ${fileName} (${formatBytes(downloadedSize)})`);
                resolve();
            });
            
            file.on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
            
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function extractArchive(archivePath, extractDir, platform) {
    const fileName = path.basename(archivePath);
    console.log(`📦 Extracting: ${fileName}`);
    console.log(`📂 Destination: ${extractDir}`);
    
    try {
        // Assure que le répertoire d'extraction existe
        fs.mkdirSync(extractDir, { recursive: true });
        
        const startTime = Date.now();
        
        if (platform === 'windows') {
            console.log(`🔧 Using adm-zip for Windows archive extraction...`);
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(archivePath);
            const entries = zip.getEntries();
            console.log(`📊 Found ${entries.length} files in archive`);
            
            zip.extractAllTo(extractDir, true);
        } else {
            console.log(`🔧 Using tar for Linux archive extraction...`);
            execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit' });
        }
        
        const duration = Date.now() - startTime;
        console.log(`✅ Extraction completed successfully in ${duration}ms`);
        
        // Affiche la structure extraite
        console.log(`📁 Extracted contents:`);
        listDirectoryContents(extractDir, 0, 2);
        
    } catch (error) {
        console.error(`❌ Extraction failed: ${error.message}`);
        
        // Fallback avec PowerShell si adm-zip échoue
        if (platform === 'windows') {
            try {
                console.log(`🔄 Trying PowerShell extraction as fallback...`);
                const powershellCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${archivePath}', '${extractDir}')`;
                execSync(`powershell -Command "${powershellCommand}"`, { stdio: 'inherit' });
                console.log(`✅ PowerShell extraction succeeded`);
            } catch (psError) {
                console.error(`❌ PowerShell extraction also failed: ${psError.message}`);
                throw error;
            }
        } else {
            throw error;
        }
    }
}

function listDirectoryContents(dir, depth, maxDepth) {
    if (depth > maxDepth) return;
    
    try {
        const items = fs.readdirSync(dir);
        for (const item of items.slice(0, 10)) { // Limite à 10 items par niveau
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            const indent = '  '.repeat(depth);
            
            if (stat.isDirectory()) {
                console.log(`${indent}📁 ${item}/`);
                if (depth < maxDepth) {
                    listDirectoryContents(itemPath, depth + 1, maxDepth);
                }
            } else {
                console.log(`${indent}📄 ${item} (${formatBytes(stat.size)})`);
            }
        }
        
        if (items.length > 10) {
            console.log(`${'  '.repeat(depth)}... et ${items.length - 10} autres fichiers`);
        }
    } catch (error) {
        console.warn(`Warning: Could not list contents of ${dir}`);
    }
}

async function copyBinaries(extractedDir, destDir, platform) {
    console.log(`📋 Copying binaries for ${platform}...`);
    console.log(`🔍 Searching for binaries in: ${extractedDir}`);
    
    // Trouve le répertoire bin dans l'archive extraite
    const binDir = findBinDirectory(extractedDir);
    if (!binDir) {
        throw new Error('Could not find bin directory in extracted archive');
    }
    
    console.log(`🎯 Found binaries directory: ${binDir}`);
    
    // Assure que le répertoire de destination existe
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`📁 Created destination directory: ${destDir}`);
    
    // Copie les binaires nécessaires
    const binaries = platform === 'windows' ? ['ffmpeg.exe', 'ffplay.exe'] : ['ffmpeg', 'ffplay'];
    
    console.log(`📦 Copying ${binaries.length} binaries: ${binaries.join(', ')}`);
    
    for (const binary of binaries) {
        const srcPath = path.join(binDir, binary);
        const destPath = path.join(destDir, binary);
        
        if (fs.existsSync(srcPath)) {
            const srcStats = fs.statSync(srcPath);
            const startTime = Date.now();
            
            console.log(`📧 Copying ${binary} (${formatBytes(srcStats.size)})...`);
            fs.copyFileSync(srcPath, destPath);
            
            const duration = Date.now() - startTime;
            console.log(`✅    ${binary} copied successfully in ${duration}ms`);
            
            // Rend exécutable sur Linux
            if (platform !== 'windows') {
                fs.chmodSync(destPath, '755');
                console.log(`🔐 Set executable permissions for ${binary}`);
            }
        } else {
            console.warn(`⚠️ Warning: ${binary} not found in ${binDir}`);
        }
    }
    
    console.log(`🎉 All binaries copied successfully to ${destDir}`);
}

function findBinDirectory(rootDir) {
    console.log(`Searching for binaries in: ${rootDir}`);
    
    function searchRecursively(dir, depth = 0) {
        if (depth > 3) return null; // Limite la profondeur de recherche
        
        try {
            const items = fs.readdirSync(dir);
            
            // Cherche d'abord un répertoire 'bin'
            for (const item of items) {
                const itemPath = path.join(dir, item);
                if (fs.statSync(itemPath).isDirectory() && item === 'bin') {
                    console.log(`Found bin directory: ${itemPath}`);
                    return itemPath;
                }
            }
            
            // Si pas de répertoire 'bin', cherche directement les binaires
            const hasFfmpeg = items.some(item => item.startsWith('ffmpeg'));
            const hasFfplay = items.some(item => item.startsWith('ffplay'));
            
            if (hasFfmpeg && hasFfplay) {
                console.log(`Found binaries directly in: ${dir}`);
                return dir;
            }
            
            // Recherche récursive dans les sous-répertoires
            for (const item of items) {
                const itemPath = path.join(dir, item);
                if (fs.statSync(itemPath).isDirectory()) {
                    const result = searchRecursively(itemPath, depth + 1);
                    if (result) return result;
                }
            }
        } catch (error) {
            console.warn(`Error reading directory ${dir}:`, error.message);
        }
        
        return null;
    }
    
    return searchRecursively(rootDir);
}

async function downloadFFmpegForPlatform(platform, arch) {
    const url = FFMPEG_URLS[platform]?.[arch];
    if (!url) {
        console.log(`⚠️  No FFmpeg download URL available for ${platform}-${arch}`);
        return;
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 DOWNLOADING FFMPEG FOR ${platform.toUpperCase()}-${arch.toUpperCase()}`);
    console.log(`${'='.repeat(80)}`);
    
    const filename = url.split('/').pop();
    const downloadPath = path.join(BINARIES_DIR, 'temp', filename);
    const extractDir = path.join(BINARIES_DIR, 'temp', 'extract');
    const destDir = path.join(BINARIES_DIR, platform, arch);
    
    console.log(`📁 Destination: ${destDir}`);
    
    // Prépare les répertoires
    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });
    
    const totalStartTime = Date.now();
    
    try {
        // Étape 1: Téléchargement
        console.log(`\n📡 STEP 1: DOWNLOADING ARCHIVE`);
        console.log(`${'─'.repeat(40)}`);
        await downloadFile(url, downloadPath);
        
        // Étape 2: Extraction
        console.log(`\n📦 STEP 2: EXTRACTING ARCHIVE`);
        console.log(`${'─'.repeat(40)}`);
        await extractArchive(downloadPath, extractDir, platform);
        
        // Étape 3: Copie des binaires
        console.log(`\n📋 STEP 3: COPYING BINARIES`);
        console.log(`${'─'.repeat(40)}`);
        await copyBinaries(extractDir, destDir, platform);
        
        const totalDuration = Date.now() - totalStartTime;
        console.log(`\n🎉 SUCCESS: FFmpeg for ${platform}-${arch} ready in ${totalDuration}ms`);
        console.log(`📍 Location: ${destDir}`);
        
    } catch (error) {
        console.error(`\n❌ FAILED: FFmpeg download for ${platform}-${arch}`);
        console.error(`💥 Error: ${error.message}`);
        throw error;
    } finally {
        // Nettoie les fichiers temporaires
        console.log(`\n🧹 CLEANING UP TEMPORARY FILES`);
        try {
            fs.rmSync(path.join(BINARIES_DIR, 'temp'), { recursive: true, force: true });
            console.log(`✅ Temporary files cleaned up`);
        } catch (error) {
            console.warn(`⚠️  Failed to clean up temp files: ${error.message}`);
        }
    }
}

async function main() {
    const scriptStartTime = Date.now();
    
    console.log(`\n${'='.repeat(100)}`);
    console.log(`📥 FFMPEG PORTABLE DOWNLOADER FOR LIVETRAD DESKTOP`);
    console.log(`${'='.repeat(100)}`);
    console.log(`📅 Starting at: ${new Date().toLocaleString()}`);
    console.log(`📍 Target directory: ${BINARIES_DIR}`);
    
    // Nettoie le répertoire binaires existant
    if (fs.existsSync(BINARIES_DIR)) {
        console.log(`🧹 Cleaning existing binaries directory...`);
        fs.rmSync(BINARIES_DIR, { recursive: true, force: true });
        console.log(`✅ Existing binaries cleaned`);
    }
    
    const platforms = [
        { platform: 'windows', arch: 'x64' },
        { platform: 'windows', arch: 'ia32' },
        { platform: 'linux', arch: 'x64' },
        { platform: 'linux', arch: 'arm64' }
    ];
    
    console.log(`\n📊 Will download FFmpeg for ${platforms.length} platforms:`);
    platforms.forEach(({ platform, arch }, index) => {
        console.log(`  ${index + 1}. ${platform}-${arch}`);
    });
    
    let successCount = 0;
    let failureCount = 0;
    const results = [];
    
    for (const { platform, arch } of platforms) {
        try {
            await downloadFFmpegForPlatform(platform, arch);
            successCount++;
            results.push({ platform, arch, status: 'SUCCESS' });
        } catch (error) {
            failureCount++;
            results.push({ platform, arch, status: 'FAILED', error: error.message });
        }
    }
    
    const totalDuration = Date.now() - scriptStartTime;
    
    console.log(`\n${'='.repeat(100)}`);
    console.log(`📦 DOWNLOAD SUMMARY`);
    console.log(`${'='.repeat(100)}`);
    console.log(`📅 Completed at: ${new Date().toLocaleString()}`);
    console.log(`⏱️  Total duration: ${totalDuration}ms`);
    console.log(`✅ Successful downloads: ${successCount}`);
    console.log(`❌ Failed downloads: ${failureCount}`);
    
    console.log(`\n📊 DETAILED RESULTS:`);
    results.forEach(({ platform, arch, status, error }) => {
        const icon = status === 'SUCCESS' ? '✅' : '❌';
        console.log(`  ${icon} ${platform}-${arch}: ${status}`);
        if (error) {
            console.log(`      Error: ${error}`);
        }
    });
    
    if (successCount > 0) {
        console.log(`\n🎉 SUCCESS! ${successCount} FFmpeg builds are ready for portable deployment`);
        console.log(`📍 Binaries location: ${BINARIES_DIR}`);
    }
    
    if (failureCount > 0) {
        console.log(`\n⚠️  WARNING: ${failureCount} downloads failed. Check your internet connection.`);
    }
    
    console.log(`\n🚀 Next steps:`);
    console.log(`  1. Run 'npm run build' to compile TypeScript`);
    console.log(`  2. Run 'npm run dev' to test the application`);
    console.log(`  3. Run 'npm run dist' to create portable distribution`);
    
    console.log(`\n${'='.repeat(100)}`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { downloadFFmpegForPlatform, main };
