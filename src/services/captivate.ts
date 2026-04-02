import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { marked } from 'marked';
import { logger } from '../utils/logger';
import { ShowNotes } from './gemini';

export class CaptivateService {
    private apiToken: string;
    private userId: string;
    private showId: string;

    constructor() {
        this.apiToken = process.env.CAPTIVATE_API_TOKEN || '';
        this.userId = process.env.CAPTIVATE_USER_ID || '';
        this.showId = process.env.CAPTIVATE_SHOW_ID || '';
    }

    async publishEpisode(audioPath: string, showNotes: ShowNotes, imagePath: string): Promise<void> {
        logger.info(`Publishing episode to Captivate: ${showNotes.title}`);
        
        if (!this.apiToken) {
            logger.warn('CAPTIVATE_API_TOKEN is not set. Skipping real API call.');
            return Promise.resolve();
        }

        if (!this.userId || !this.showId) {
            throw new Error('CAPTIVATE_USER_ID and CAPTIVATE_SHOW_ID are required for real API usage.');
        }

        let bearerToken = '';
        try {
            logger.info('Authenticating to Captivate to retrieve session token...');
            const authRes = await axios.post('https://api.captivate.fm/authenticate/token', {
                username: this.userId,
                token: this.apiToken
            });
            bearerToken = authRes.data.user.token;
        } catch (error: any) {
             logger.error('Failed to authenticate with Captivate: ' + (error.response?.data?.message || error.message));
             throw error;
        }

        let mediaId = '';
        try {
            logger.info('Uploading media to Captivate...');
            const mediaForm = new FormData();
            mediaForm.append('file', fs.createReadStream(audioPath), { filename: 'episode.mp3', contentType: 'audio/mpeg' });
            
            const mediaRes = await axios.post(`https://api.captivate.fm/shows/${this.showId}/media`, mediaForm, {
                headers: {
                    ...mediaForm.getHeaders(),
                    'Authorization': `Bearer ${bearerToken}`
                }
            });
            mediaId = mediaRes.data.media.id;
            logger.info(`Captivate media uploaded: ${mediaId}`);
        } catch (error: any) {
             logger.error('Failed to upload media to Captivate: ' + JSON.stringify(error.response?.data || error.message));
             throw error;
        }

        logger.info('Sending episode JSON to Captivate...');
        
        const htmlShowNotes = await marked.parse(showNotes.summary, { breaks: true, gfm: true });
        
        const formData = new FormData();
        formData.append('shows_id', this.showId);
        formData.append('media_id', mediaId);
        formData.append('title', showNotes.title);
        // Transform the markdown blob exclusively into RSS-safe HTML structure to bypass dashboard text-stripping
        formData.append('shownotes', htmlShowNotes.substring(0, 3999));
        formData.append('summary', showNotes.summary.substring(0, 3000));
        formData.append('status', 'Draft');

        if (imagePath && imagePath.startsWith('http')) {
            logger.info(`Attaching Episode Artwork as native HTTP URL...`);
            formData.append('episode_art', imagePath);
        } else {
            logger.warn(`Valid HTTP Artwork not found, uploading episode without custom cover art.`);
        }

        try {
            await axios.post(`https://api.captivate.fm/episodes`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${bearerToken}`
                }
            });
            logger.info('Captivate draft episode created successfully.');
        } catch (error: any) {
            logger.error('Failed to publish to Captivate: ' + JSON.stringify(error.response?.data || error.message));
            throw error;
        }
    }
}
