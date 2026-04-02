import axios from 'axios';
import { logger } from '../utils/logger';

export class ZernioService {
    private apiKey: string;
    private accountId: string;

    constructor() {
        this.apiKey = process.env.ZERNIO_API_KEY || '';
        this.accountId = process.env.ZERNIO_YOUTUBE_ACCOUNT_ID || '';
    }

    async publishToYouTube(videoUrl: string, thumbnailUrl: string, title: string, description: string, keywordsStr: string = ''): Promise<void> {
        logger.info(`Publishing to YouTube via Zernio: ${title}`);
        
        if (!this.apiKey || !this.accountId) {
             logger.warn('ZERNIO_API_KEY or ZERNIO_YOUTUBE_ACCOUNT_ID is completely missing. Safely bypassing YouTube upload.');
             return Promise.resolve();
        }

        try {
             // Zernio supports explicit tags mapping inside the platformSpecific payload.
             const tagsArray = keywordsStr ? keywordsStr.split(',').map(k => k.trim()).filter(Boolean) : [];

             const payload = {
                 content: description,
                 mediaItems: [
                     {
                         type: 'video',
                         url: videoUrl,
                         thumbnail: thumbnailUrl
                     }
                 ],
                 platforms: [
                     {
                         platform: 'youtube',
                         accountId: this.accountId,
                         platformSpecificData: {
                             title: title.substring(0, 100),
                             visibility: 'private',  // Default to private for safety and human review
                             categoryId: '27',       // Education
                             madeForKids: false,
                             tags: tagsArray
                         }
                     }
                 ],
                 publishNow: true
             };

             const res = await axios.post('https://zernio.com/api/v1/posts', payload, {
                 headers: {
                     'Authorization': `Bearer ${this.apiKey}`,
                     'Content-Type': 'application/json'
                 }
             });

             logger.info(`Zernio YouTube submission successful! Response ID: ${res.data.post?.id || 'Unknown'}`);
        } catch (error: any) {
             logger.error('Zernio deployment heavily failed: ' + JSON.stringify(error.response?.data || error.message));
             throw error;
        }
    }
}
