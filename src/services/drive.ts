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
                scopes: ['https://www.googleapis.com/auth/drive'],
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

    /**
     * Finds a folder by name inside a parent, or creates it if it doesn't exist.
     * Required for dynamic "Finished Assets -> Client Name -> Episode Name" nesting.
     * @param parentFolderId The root Google Drive directory ID to begin nesting in
     * @param folderName The target name of the folder
     */
    async getOrCreateFolder(parentFolderId: string, folderName: string): Promise<string> {
        try {
            // First, cleanly check if this literal folder name already exists exactly inside that parent
            const sanitizedName = folderName.replace(/'/g, "\\'");
            const res = await this.drive.files.list({
                q: `mimeType='application/vnd.google-apps.folder' and name='${sanitizedName}' and '${parentFolderId}' in parents and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive',
            });

            if (res.data.files && res.data.files.length > 0) {
                // Folder organically exists!
                return res.data.files[0].id!;
            }

            logger.info(`Creating brand new structural folder '${folderName}' natively inside Drive parent ${parentFolderId}...`);
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId]
            };

            const createdFolder = await this.drive.files.create({
                requestBody: fileMetadata,
                fields: 'id',
            });

            return createdFolder.data.id!;

        } catch (error: any) {
            logger.error(`Failed to natively traverse or instantiate Drive folder '${folderName}': ${error.message}`);
            throw error;
        }
    }

    /**
     * Uploads a localized asset back to Google Drive and forces it to be universally shareable
     * @param localPath The local /tmp/ file path
     * @param mimeType The file mime type (e.g., 'image/jpeg')
     * @param parentFolderId The target Google Drive folder 
     * @returns The public viewable HTTP url
     */
    async uploadFile(localPath: string, mimeType: string, parentFolderId: string): Promise<string> {
         logger.info(`Uploading finished asset ${path.basename(localPath)} back into Cloud...`);
         
         if (!fs.existsSync(localPath)) throw new Error(`Asset not found locally: ${localPath}`);

         const fileMetadata = {
             name: path.basename(localPath),
             parents: [parentFolderId]
         };

         const media = {
             mimeType,
             body: fs.createReadStream(localPath)
         };

         try {
             const fileRes = await this.drive.files.create({
                 requestBody: fileMetadata,
                 media: media,
                 fields: 'id, webViewLink, webContentLink',
             });

             const fileId = fileRes.data.id;

             // Force universal sharing so human editors or Zernio can read the links
             await this.drive.permissions.create({
                 fileId: fileId,
                 requestBody: { role: 'reader', type: 'anyone' }
             });

             // webContentLink initiates direct download, webViewLink is just the viewer page.
             // webContentLink is far safer for Publisher / external daemons to easily parse.
             const publicUrl = fileRes.data.webContentLink || fileRes.data.webViewLink;
             logger.info(`Asset uploaded successfully! Public Link: ${publicUrl}`);
             return publicUrl;
             
         } catch (error: any) {
             logger.error(`Failed to upload ${localPath} to Drive: ${error.message}`);
             throw error;
         }
    }
}
