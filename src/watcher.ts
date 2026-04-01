import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger';
import { runPipeline } from './index';

const UPLOAD_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop', 'Podcast_Uploads');
const ARCHIVE_DIR = path.join(UPLOAD_DIR, 'Archive');

// Create directories if they don't exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

logger.info(`Started Daemon. Watching for audio files in: ${UPLOAD_DIR}`);

// A simple queue system to ensure only 1 pipeline runs at a time
let isProcessing = false;
const queue: string[] = [];

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    const fileToProcess = queue.shift()!;
    logger.info(`[Queue] Processing picked up: ${fileToProcess}`);
    
    try {
        await runPipeline(fileToProcess);
        
        // Move to Archive on Success
        const filename = path.basename(fileToProcess);
        const archivePath = path.join(ARCHIVE_DIR, filename);
        
        fs.renameSync(fileToProcess, archivePath);
        logger.info(`[Queue] Successfully processed and archived: ${filename}`);
    } catch (error: any) {
        logger.error(`[Queue] Pipeline failed for ${fileToProcess}: ${error.message}`);
        logger.warn(`[Queue] File left in upload directory due to error. Fix the configuration and state json to resume.`);
    }

    isProcessing = false;
    // Check if more items arrived while processing
    if (queue.length > 0) {
        logger.info(`[Queue] Moving to next file. Items left in queue: ${queue.length}`);
        processQueue();
    }
}

// Chokidar watcher setup
const watcher = chokidar.watch(UPLOAD_DIR, {
    ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        /Archive/, // ignore nested archive folder
        /.*\.json/, // ignore state jsons in case they appear
        /.*\.jpg/ // ignore cover arts
    ],
    persistent: true,
    awaitWriteFinish: {
        // This is crucial for large files (100MB+)
        stabilityThreshold: 5000, 
        pollInterval: 1000
    },
    ignoreInitial: true, // Don't run on files already sitting there when script starts unless desired
    depth: 0 // Only watch the root of Podcast_Uploads
});

watcher.on('add', (filePath) => {
    // Only accept audio extensions
    const ext = path.extname(filePath).toLowerCase();
    if (['.mp3', '.wav', '.m4a', '.mp4'].includes(ext)) {
        logger.info(`[Watcher] New audio file completely written: ${path.basename(filePath)}`);
        queue.push(filePath);
        processQueue();
    } else {
        logger.warn(`[Watcher] Ignored non-audio file: ${path.basename(filePath)}`);
    }
});

watcher.on('error', error => logger.error(`[Watcher] Chokidar Error: ${error}`));
