import axios from 'axios';
import fs from 'fs';
import { logger } from '../utils/logger';

export class ImageBotService {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateGraphics(title: string, prompt: string, outputPath: string, aspectRatio: '1:1' | '16:9' = '1:1'): Promise<string> {
        logger.info(`Generating ${aspectRatio} graphic for: "${title}"`);
        
        if (!prompt) {
             prompt = `A cinematic, highly detailed podcast cover art for an episode titled: ${title}. Bold colors, clean composition, minimalist background.`;
             logger.warn('No explicit prompt provided. Falling back to default prompt template.');
        }

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${this.apiKey}`;
            const res = await axios.post(url, {
                instances: [ { prompt } ],
                parameters: { sampleCount: 1, aspectRatio }
            });

            const b64 = res.data.predictions[0].bytesBase64Encoded;
            const buffer = Buffer.from(b64, 'base64');
            
            fs.writeFileSync(outputPath, buffer);

            logger.info(`ImageBot completed. Graphic at: ${outputPath}`);
            return outputPath;
        } catch (error: any) {
             logger.error('Imagen API failed: ' + JSON.stringify(error.response?.data || error.message));
             throw error;
        }
    }
}
