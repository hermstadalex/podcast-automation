import { google } from 'googleapis';
import fs from 'fs';
import { logger } from '../utils/logger';

export class YouTubeService {
    private oauth2Client;

    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.YOUTUBE_CLIENT_ID,
            process.env.YOUTUBE_CLIENT_SECRET,
            'https://podcastpartnership.com' // Redirect URI from your python script
        );

        this.oauth2Client.setCredentials({
            refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
        });
    }

    async uploadVideo(videoPath: string, showNotes: any): Promise<string> {
        logger.info(`Starting YouTube video upload for ${videoPath}...`);
        
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found at ${videoPath}`);
        }

        const youtube = google.youtube({
            version: 'v3',
            auth: this.oauth2Client
        });

        try {
            const fileSize = fs.statSync(videoPath).size;
            
            const res = await youtube.videos.insert({
                part: ['snippet', 'status'],
                requestBody: {
                    snippet: {
                        title: showNotes.title.substring(0, 100), // Max 100 chars
                        description: `${showNotes.summary}\n\nTimestamps:\n${showNotes.timestamps.join('\n')}`,
                        tags: ['podcast', 'business'], 
                        categoryId: '27', // Education
                    },
                    status: {
                        privacyStatus: 'private', // Upload as private first so you can review it before publishing
                        selfDeclaredMadeForKids: false
                    }
                },
                media: {
                    body: fs.createReadStream(videoPath)
                }
            }, {
                // Monitor upload progress
                onUploadProgress: evt => {
                    const progress = (evt.bytesRead / fileSize) * 100;
                    if (progress % 25 < 1) { // Log roughly every 25%
                        logger.info(`YouTube Upload Progress: ${Math.round(progress)}%`);
                    }
                }
            });

            const videoId = res.data.id;
            const videoUrl = `https://youtu.be/${videoId}`;
            logger.info(`YouTube upload successful! Video URL: ${videoUrl}`);
            return videoUrl;

        } catch (error: any) {
            logger.error(`YouTube API failed: ${error.message} - ${JSON.stringify(error.errors || error.response?.data)}`);
            throw error;
        }
    }
}
