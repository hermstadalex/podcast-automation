import { config } from 'dotenv';
import { SheetsService } from './services/sheets';
import { CaptivateService } from './services/captivate';
import { ZernioService } from './services/zernio';
import { logger } from './utils/logger';
import path from 'path';
import axios from 'axios';
import fs from 'fs';

config();

export async function runPublisher() {
    logger.info('Starting Phase 2: Publisher Poll...');
    const clientSheetsService = new SheetsService(process.env.GOOGLE_SHEETS_CLIENTS_ID);
    const tabName = process.env.GOOGLE_SHEETS_TAB_NAME || 'Podcasts';

    let clientRows: any[][] = [];
    try {
        clientRows = await clientSheetsService.getRows('Clients').catch(() => []);
    } catch (e: any) {
        logger.error(`Failed to read Global Router Database: ${e.message}`);
        return; // Don't crash daemon
    }

    // Outer loop: Iterate sequentially across the entire array of completely quarantined Client Domains
    for (let c = 1; c < clientRows.length; c++) {
        const r = clientRows[c];
        if (!r || !r[0] || r[0] === '') continue; // Skip broken rows or empty slots

        const clientCode = r[0].toString().toUpperCase().trim();
        const approvalSheetId = r[3]; // Column D
        const clientConfig = { captivateId: r[1] || '', zernioId: r[2] || '' }; // Columns B and C

        logger.info(`Polling completely isolated Approval Spreadsheet for Client: [${clientCode}]...`);
        const targetSheetService = new SheetsService(approvalSheetId);
        let rows: any[][] = [];
        try {
            rows = await targetSheetService.getRows(tabName);
        } catch (e: any) {
            logger.warn(`Could not read ${tabName} tab in Spreadsheet ${approvalSheetId} for ${clientCode}. Proceeding to next client...`);
            continue;
        }

        // Inner logic exactly identical, but hitting local variables strictly mapping to targetSheetService
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            // Columns: title(0), notes(1), hash(2), keys(3), art(4), url(5), approved?(6), posted?(7), date(8), thumb(9), clientCode(10)
            const title = row[0];
            const showNotesStr = row[1];
            const artPath = row[4];
            const mediaPath = row[5];
            const approved = row[6]?.toString().toUpperCase().trim();
            const posted = row[7]?.toString().toUpperCase().trim();

            if (approved === 'YES' && posted === 'NO') {
                logger.info(`Found approved, unposted episode: "${title}" natively within isolated domain [${clientCode}]`);
                
                try {
                    let localArtUrl = artPath;
                    let localAudioUrl = mediaPath;
                    if (mediaPath?.startsWith('http')) {
                        logger.info('Downloading overriding custom audio from URL...');
                        localAudioUrl = `/tmp/custom_${Date.now()}.mp3`;
                        const res = await axios.get(mediaPath, { responseType: 'arraybuffer' });
                        fs.writeFileSync(localAudioUrl, res.data);
                    }

                    const captivatePayload = {
                        clientName: clientCode,
                        title: title,
                        summary: showNotesStr,
                        timestamps: [],
                        hashtags: '',
                        keywords: '',
                        squareArtPrompt: '',
                        landscapeThumbPrompt: ''
                    };

                    const captivate = new CaptivateService(clientConfig.captivateId);
                    logger.info(`Publishing to Captivate dynamically for ${clientCode}...`);
                    await captivate.publishEpisode(localAudioUrl, captivatePayload, localArtUrl);
                    logger.info('Captivate successful!');
                    
                    if (mediaPath) {
                        const youtubeThumbUrl = row[9];
                        if (youtubeThumbUrl && youtubeThumbUrl !== 'N/A') {
                            logger.info('Proceeding to Zernio YouTube publisher phase...');
                            const zernio = new ZernioService(clientConfig.zernioId);
                            const keywordsStr = row[3] || '';
                            await zernio.publishToYouTube(mediaPath, youtubeThumbUrl, title, showNotesStr, keywordsStr);
                        } else {
                            logger.warn('No Landscape Thumbnail URL found in Spreadsheet. Bypassing YouTube publish logic.');
                        }
                    } else {
                        logger.warn('No media URL found. Bypassing YouTube logic entirely.');
                    }
                    
                    logger.info(`Updating status to POSTED=yes entirely inside Private ${clientCode} Spreadsheet...`);
                    const targetRowNumber = i + 1; 
                    await targetSheetService.updateCell(tabName, targetRowNumber, 'H', 'yes');
                    logger.info(`Episode successfully published and locally synchronized!`);

                } catch (err: any) {
                    logger.error(`Publisher failed for episode "${title}": ${err.message}`);
                }
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
