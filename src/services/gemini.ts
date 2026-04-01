import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { logger } from '../utils/logger';

export interface ShowNotes {
    clientName: string;
    title: string;
    summary: string;
    timestamps: string[];
    hashtags: string;
    keywords: string;
    squareArtPrompt: string;
    landscapeThumbPrompt: string;
}

export class GeminiService {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
    }

    async generateShowNotes(audioFilePath: string): Promise<ShowNotes> {
        logger.info(`Generating show notes with Gemini for ${audioFilePath}`);
        
        if (!this.apiKey) {
            logger.warn('GEMINI_API_KEY is not set. Returning mock show notes.');
            return {
                clientName: "Mock Client Show",
                title: "Mock Podcast Episode",
                summary: "This is a mock summary of the podcast episode.",
                timestamps: ["00:00 - Intro"],
                hashtags: "#podcast #mock",
                keywords: "podcast, mock, test",
                squareArtPrompt: "A 1:1 square mock image.",
                landscapeThumbPrompt: "A 16:9 landscape mock thumbnail."
            };
        }

        const fileManager = new GoogleAIFileManager(this.apiKey);
        const genAI = new GoogleGenerativeAI(this.apiKey);
        
        // 1. Upload audio file to Gemini
        logger.info('Uploading media file to Gemini...');
        const uploadResult = await fileManager.uploadFile(audioFilePath, {
            mimeType: 'audio/mp3',
        });
        logger.info(`File uploaded via Gemini File API: ${uploadResult.file.uri}`);

        // 2. Poll for processing completion
        let fileState = await fileManager.getFile(uploadResult.file.name);
        while (fileState.state === 'PROCESSING') {
            logger.info('Waiting for Gemini to process media file...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
            fileState = await fileManager.getFile(uploadResult.file.name);
        }
        
        if (fileState.state === 'FAILED') {
            throw new Error('Gemini audio processing failed.');
        }

        // 3. Generate Content
        logger.info('Generating advanced metadata from media...');
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const result = await model.generateContent([
            "Analyze this podcast media. You are an expert podcast producer and YouTube strategist. Generate the following strict JSON structure:\n" +
            "1. clientName: Extract the core Brand name, Show name, or Client name from the host's intro organically (Max 3 words, e.g., 'Joe Rogan' or 'Acquired Podcast').\n" +
            "2. title: A catchy, viral-worthy, SEO-optimized title for YouTube.\n" +
            "3. summary: A compelling 2-3 paragraph podcast show notes summary.\n" +
            "4. timestamps: An array of 5-7 key timestamps in 'MM:SS - Description' format.\n" +
            "5. hashtags: A single string of 3-5 trending, highly relevant hashtags with spaces (e.g. '#business #growth #startup').\n" +
            "6. keywords: A comma-separated string of 10 long-tail SEO keywords targeted for YouTube search.\n" +
            "7. squareArtPrompt: A highly-detailed, visually descriptive prompt designed for an AI image generator to create centered, bold, minimalist 1:1 Podcast Cover art. Emphasize visual subjects, branding, and color palette.\n" +
            "8. landscapeThumbPrompt: A completely distinct prompt designed for a YouTube 16:9 thumbnail. Emphasize 'MrBeast-style' high-contrast lighting, a central dramatic focal point (e.g. human face reaction), saturated colors, and negative space for text.\n" +
            "Never use markdown code blocks, output raw JSON only.",
            {
                fileData: {
                    fileUri: uploadResult.file.uri,
                    mimeType: uploadResult.file.mimeType
                }
            }
        ]);

        const responseText = result.response.text().trim();
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '');
        
        return JSON.parse(cleanJson) as ShowNotes;
    }
}
