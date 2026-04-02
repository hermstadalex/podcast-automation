import { config } from 'dotenv';
import { DriveService } from './services/drive';
import { runPipeline } from './index';
import { logger } from './utils/logger';
import path from 'path';
import fs from 'fs';

config();

const SCAN_INTERVAL_MS = 10 * 60 * 1000; // Poll every 10 minutes

async function processDriveInbox() {
    const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!driveFolderId || driveFolderId === 'YOUR_DRIVE_FOLDER_ID_HERE') {
        logger.error('GOOGLE_DRIVE_FOLDER_ID is missing from .env');
        process.exit(1);
    }

    const driveService = new DriveService();
    
    try {
        logger.info(`Scanning Google Drive Parent Dropzone: ${driveFolderId} ...`);
        const clientFolders = await driveService.listFolders(driveFolderId);
        
        if (clientFolders.length === 0) {
            logger.info('No client subfolders discovered in drop-zone.');
            return;
        }

        for (const clientFolder of clientFolders) {
            const clientCode = clientFolder.name?.trim().toUpperCase() || 'UNKNOWN';
            const files = await driveService.scanFolder(clientFolder.id!);
            
            if (files.length > 0) logger.info(`Found ${files.length} unfinished files natively inside client [${clientCode}]`);

            for (const file of files) {
                const fileId = file.id!;
                const fileName = file.name!;
                const statePath = path.join(process.cwd(), `.state-${fileId}.json`);

                // Skip anything we already downloaded and processed
                if (fs.existsSync(statePath)) {
                    continue; // Suppress spam for already processed items
                }

                logger.info(`[NEW FILE DETECTED]: ${fileName} for Client ${clientCode} (ID: ${fileId})`);
                const localDestPath = `/tmp/gdrive_${fileId}_${fileName.replace(/\s+/g, '_')}`;

                try {
                    // Download the giant file
                    await driveService.downloadFile(fileId, localDestPath);
                    
                    // Fire off the generation Phase 1 pipeline explicitly with the Client Code Context!
                    logger.info(`Firing Phase 1 Generator on ${localDestPath}`);
                    await runPipeline(localDestPath, fileId, clientCode);

                    logger.info(`Successfully completed pipeline loop for ${fileName}`);
                    
                } catch (e: any) {
                    logger.error(`Critical failure during download or execution of ${fileName}: ${e.message}`);
                    // Move to next file rather than completely dying
                }
            }
        }

    } catch (e: any) {
        logger.error(`Failed during Drive scan cycle: ${e.message}`);
    }
}

// Start the daemon Poller
logger.info(`☁️ Starting Google Drive Watcher Daemon (Polling every ${SCAN_INTERVAL_MS / 60000} mins)`);

// Run immediately once on Startup
processDriveInbox();

// Schedule continual loops
setInterval(() => {
    processDriveInbox();
}, SCAN_INTERVAL_MS);
