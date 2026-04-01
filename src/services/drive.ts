import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export class DriveService {
    private drive: any;

    constructor() {
        const keyFilePath = path.join(__dirname, '../../service_account.json');
        
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: keyFilePath,
                scopes: ['https://www.googleapis.com/auth/drive.readonly'],
            });
            this.drive = google.drive({ version: 'v3', auth });
        } catch (e: any) {
            logger.error(`Could not initialize Drive API. Ensure service_account.json is present.`);
        }
    }

    /**
     * Scans a specific folder for unarchived media files
     * @param folderId The Google Drive ID from the URL
     */
    async scanFolder(folderId: string) {
        if (!folderId) throw new Error('Missing Google Drive Folder ID');
        
        try {
            // We only want files, specifically searching inside the target drop-zone folder
            const res = await this.drive.files.list({
                q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/')`,
                fields: 'files(id, name, size)',
            });
            return res.data.files || [];
        } catch (error: any) {
            logger.error(`Drive API Scan Failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Streams a massive file from Google Drive into the local fast NVMe /tmp/ storage
     * @param fileId Drive File ID
     * @param destPath Local output absolute path
     */
    async downloadFile(fileId: string, destPath: string): Promise<string> {
        logger.info(`Starting cloud download for file ID: ${fileId}...`);
        
        return new Promise(async (resolve, reject) => {
            try {
                const dest = fs.createWriteStream(destPath);
                
                const res = await this.drive.files.get(
                    { fileId, alt: 'media' },
                    { responseType: 'stream' }
                );

                res.data
                    .on('end', () => {
                        logger.info(`Done downloading ${fileId} from Google Drive.`);
                        resolve(destPath);
                    })
                    .on('error', (err: any) => {
                        logger.error(`Error downloading from Drive:`);
                        reject(err);
                    })
                    .pipe(dest);

            } catch (error: any) {
                logger.error(`Drive file fetch failed: ${error.message}`);
                reject(error);
            }
        });
    }
}
