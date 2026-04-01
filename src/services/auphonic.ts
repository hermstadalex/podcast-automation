import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { logger } from '../utils/logger';

export class AuphonicService {
  private apiKey: string;
  private presetId: string;

  constructor() {
    this.apiKey = process.env.AUPHONIC_API_KEY || '';
    this.presetId = process.env.AUPHONIC_PRESET_ID || '';
  }

  async processAudio(inputPath: string, uuid: string, imagePath?: string): Promise<string> {
    logger.info(`Starting Auphonic processing for ${inputPath}...`);
    
    if (!this.apiKey) {
        logger.warn('AUPHONIC_API_KEY is not set. Running in mock mode.');
        return Promise.resolve('/tmp/mock_cleaned_audio.mp3');
    }
    
    if (!this.presetId) {
        throw new Error('AUPHONIC_PRESET_ID is required for real Auphonic API usage.');
    }

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    logger.info('Creating Auphonic production...');
    let productionUuid = '';
    
    // Step 1: Create Production with output_files via pure JSON
    const createPayload = {
        preset: this.presetId,
        output_files: [
            { format: 'mp3', bitrate: '112', ending: 'mp3' },
            { format: 'audiogram', ending: 'mp4' }
        ]
    };

    try {
        const createRes = await axios.post(`https://auphonic.com/api/productions.json`, createPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
        productionUuid = createRes.data?.data?.uuid;

        if (!productionUuid) throw new Error('Failed to retrieve Auphonic production UUID');

        // Step 2: Upload Audio
        logger.info(`Uploading audio file to production ${productionUuid}...`);
        const audioForm = new FormData();
        audioForm.append('input_file', fs.createReadStream(inputPath));
        await axios.post(`https://auphonic.com/api/production/${productionUuid}/upload.json`, audioForm, {
            headers: { ...audioForm.getHeaders(), 'Authorization': `Bearer ${this.apiKey}` }
        });

        // Step 3: Upload Cover Art (if exists)
        if (imagePath && fs.existsSync(imagePath)) {
            logger.info(`Uploading cover art to production ${productionUuid}...`);
            const imageForm = new FormData();
            imageForm.append('image', fs.createReadStream(imagePath));
            await axios.post(`https://auphonic.com/api/production/${productionUuid}/upload.json`, imageForm, {
                headers: { ...imageForm.getHeaders(), 'Authorization': `Bearer ${this.apiKey}` }
            });
        }

        // Step 4: Start Production
        logger.info(`Starting production ${productionUuid}...`);
        await axios.post(`https://auphonic.com/api/production/${productionUuid}/start.json`, {}, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });

    } catch (e: any) {
        logger.error(`Auphonic POST error: ${JSON.stringify(e.response?.data || e.message)}`);
        throw e;
    }

    if (!productionUuid) {
        throw new Error('Failed to retrieve Auphonic production UUID');
    }

    logger.info(`Auphonic production started: ${productionUuid}`);

    // Poll until complete
    let status = 0; // 0 = processing, 1 = wait, 2 = error, 3 = done
    let outputFiles: any[] = [];

    while (status !== 3) {
        logger.info(`Polling Auphonic status for ${productionUuid}...`);
        await new Promise(r => setTimeout(r, 10000)); // wait 10s
        
        const statusRes = await axios.get(`https://auphonic.com/api/production/${productionUuid}.json`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        
        const productionData = statusRes.data?.data;
        status = productionData?.status;
        
        if (status === 2 || status === undefined) {
            throw new Error('Auphonic processing failed with status error.');
        }

        if (status === 3) {
            outputFiles = productionData.output_files || [];
            if (outputFiles.length === 0) throw new Error('Could not find output files from Auphonic');
        }
    }

    let mp3Url = '';
    let mp4Url = '';
    for (const file of outputFiles) {
        if (file.format === 'mp3' || file.ending === 'mp3') mp3Url = file.download_url;
        if (file.format === 'audiogram' || file.format === 'video' || file.ending === 'mp4') mp4Url = file.download_url;
    }

    if (!mp3Url) throw new Error('Could not find mp3 output URL from Auphonic');

    logger.info(`Auphonic processing complete. Downloading mp3 result...`);
    const outputPath = `/tmp/auphonic_cleaned_${productionUuid}.mp3`;
    
    const downloadRes = await axios.get(mp3Url, {
        responseType: 'arraybuffer',
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    fs.writeFileSync(outputPath, downloadRes.data);

    if (mp4Url) {
         logger.info(`Downloading audiogram mp4 result...`);
         const mp4Path = `/tmp/auphonic_cleaned_${productionUuid}.mp4`;
         const mp4Res = await axios.get(mp4Url, {
            responseType: 'arraybuffer',
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
         });
         fs.writeFileSync(mp4Path, mp4Res.data);
    }
    
    return outputPath;
  }
}
