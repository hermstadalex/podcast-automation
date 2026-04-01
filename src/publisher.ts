import { config } from 'dotenv';
import { SheetsService } from './services/sheets';
import { CaptivateService } from './services/captivate';
import { logger } from './utils/logger';
import path from 'path';
import axios from 'axios';
import fs from 'fs';

config();

export async function runPublisher() {
    logger.info('Starting Phase 2: Publisher Poll...');
    const sheetsService = new SheetsService();
    const tabName = process.env.GOOGLE_SHEETS_TAB_NAME || 'Podcasts';

    let rows: any[][] = [];
    try {
        rows = await sheetsService.getRows(tabName);
    } catch (e: any) {
        logger.error(`Failed to read from Google Sheets: ${e.message}`);
        process.exit(1);
    }

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // Columns: title(0), notes(1), hash(2), keys(3), art(4), url(5), approved?(6), posted?(7)
        const title = row[0];
        const showNotesStr = row[1];
        const artPath = row[4];
        const mediaPath = row[5];
        const approved = row[6]?.toString().toUpperCase().trim();
        const posted = row[7]?.toString().toUpperCase().trim();

        if (approved === 'YES' && posted === 'NO') {
            logger.info(`Found approved, unposted episode: "${title}"`);
            
            try {
                // We don't download the Artwork because Captivate expects a 255-character string URL!
                let localArtUrl = artPath;

                let localAudioUrl = mediaPath;
                if (mediaPath?.startsWith('http')) {
                    // It's possible the user overrode the audio link as well
                    logger.info('Downloading overriding custom audio from URL...');
                    localAudioUrl = `/tmp/custom_${Date.now()}.mp3`;
                    const res = await axios.get(mediaPath, { responseType: 'arraybuffer' });
                    fs.writeFileSync(localAudioUrl, res.data);
                }

                const captivatePayload = {
                    clientName: '',
                    title: title,
                    summary: showNotesStr,
                    timestamps: [],
                    hashtags: '',
                    keywords: '',
                    squareArtPrompt: '',
                    landscapeThumbPrompt: ''
                };

                const captivate = new CaptivateService();
                logger.info('Publishing to Captivate...');
                await captivate.publishEpisode(localAudioUrl, captivatePayload, localArtUrl);
                
                logger.info('Captivate successful! Updating Google Sheet status to POSTED=yes...');
                
                // Update column H (index 7, which is basically column H string representation)
                // Row is i + 1 (1-based for Sheets API)
                const targetRowNumber = i + 1; 
                await sheetsService.updateCell(tabName, targetRowNumber, 'H', 'yes');

                logger.info(`Episode successfully published and synced!`);

            } catch (err: any) {
                logger.error(`Publisher failed for episode "${title}": ${err.message}`);
                // Don't kill the loop, move to next item
            }
        }
    }
    
    logger.info('Publisher Poll finished.');
}

if (require.main === module) {
    logger.info('Publisher Daemon Initialized. Polling Google Sheets every 60 seconds for approvals...');
    
    // Run immediately once
    runPublisher().catch(e => {
        logger.error(`Initial publisher run failed: ${e.message}`);
    });

    // Then loop forever 
    setInterval(() => {
        runPublisher().catch(e => {
            logger.error(`Publisher poll failed: ${e.message}`);
        });
    }, 60 * 1000); // Poll every minute
}
