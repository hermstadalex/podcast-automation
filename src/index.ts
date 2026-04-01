import { config } from 'dotenv';
import path from 'path';
import { logger } from './utils/logger';
import { loadState, saveState, PipelineState } from './utils/state';
import { withRetry } from './utils/retry';
import { AuphonicService } from './services/auphonic';
import { GeminiService } from './services/gemini';
import { ImageBotService } from './services/imagebot';
import { CaptivateService } from './services/captivate';
import { VideoService } from './services/video';
import { YouTubeService } from './services/youtube';
import { SheetsService } from './services/sheets';
import { DriveService } from './services/drive';
import fs from 'fs';

config();

export async function runPipeline(inputPath: string, manualId?: string) {
  logger.info(`Starting Phase 1 pipeline for: ${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    logger.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const pipelineId = manualId || path.basename(inputPath, path.extname(inputPath)).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  let state: PipelineState = loadState(pipelineId);

  try {
    // STEP 1: Gemini Text Extraction (on Raw Audio)
    if (!state.showNotes) {
        const geminiService = new GeminiService();
        state.showNotes = await withRetry(() => geminiService.generateShowNotes(inputPath), 'Gemini Extraction');
        saveState(pipelineId, state);
        logger.info(`Gemini completed. Show notes title: ${state.showNotes.title}`);
    } else {
        logger.info(`Skipping Gemini. Found existing show notes: ${state.showNotes.title}`);
    }

    // STEP 2: Generate Cover Art and YouTube Thumbnail
    if (!state.imageLoc || !state.youtubeThumbLoc) {
        const imageBot = new ImageBotService(process.env.GEMINI_API_KEY!);
        
        if (!state.imageLoc) {
            const outputImage = `/tmp/${pipelineId}_cover.jpg`;
            state.imageLoc = await withRetry(() => imageBot.generateGraphics(state.showNotes.title, state.showNotes.squareArtPrompt, outputImage, '1:1'), 'ImageBot Generation');
            saveState(pipelineId, state);
        }

        if (!state.youtubeThumbLoc) {
            const outputThumb = `/tmp/${pipelineId}_thumb.jpg`;
            state.youtubeThumbLoc = await withRetry(() => imageBot.generateGraphics(state.showNotes.title, state.showNotes.landscapeThumbPrompt, outputThumb, '16:9'), 'ImageBot Thumb Gen');
            saveState(pipelineId, state);
        }
    } else {
        logger.info(`Skipping ImageBot. Found existing graphic: ${state.imageLoc} and thumbnail: ${state.youtubeThumbLoc}`);
    }

    // STEP 3: Auphonic Audio Cleaning & Audiogram Video
    if (!state.cleanedAudioLoc) {
        const auphonic = new AuphonicService();
        state.cleanedAudioLoc = await withRetry(() => auphonic.processAudio(inputPath, pipelineId, state.imageLoc!), 'Auphonic Processing');
        
        // We'll store the video path implicitly based on Auphonic's output logic
        // For now, assume processAudio returns the mp3 path, and the mp4 is saved alongside it
        state.videoLoc = state.cleanedAudioLoc.replace('.mp3', '.mp4');
        
        saveState(pipelineId, state);
        logger.info(`Auphonic completed. Cleaned audio at: ${state.cleanedAudioLoc}`);
        logger.info(`Auphonic completed. Audiogram video at: ${state.videoLoc}`);
    } else {
        logger.info(`Skipping Auphonic. Found existing audio: ${state.cleanedAudioLoc}`);
        logger.info(`Skipping Auphonic. Found existing video: ${state.videoLoc}`);
    }

    // STEP 4: Cloud CMS Reverse-Hosting (Upload Assets to Drive)
    let squareArtDriveUrl = state.imageLoc;
    let landscapeThumbDriveUrl = state.youtubeThumbLoc;
    let audioDriveUrl = state.cleanedAudioLoc;
    let videoDriveUrl = state.videoLoc;

    const driveService = new DriveService();
    const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (driveFolderId) {
        logger.info('Commencing Cloud CMS Upload Phase...');
        try {
            if (state.imageLoc && !state.imageLoc.startsWith('http')) {
                squareArtDriveUrl = await withRetry(() => driveService.uploadFile(state.imageLoc!, 'image/jpeg', driveFolderId), 'Drive Upload Square Art');
            }
            if (state.youtubeThumbLoc && !state.youtubeThumbLoc.startsWith('http')) {
                landscapeThumbDriveUrl = await withRetry(() => driveService.uploadFile(state.youtubeThumbLoc!, 'image/jpeg', driveFolderId), 'Drive Upload Landscape Thumb');
            }
            if (state.cleanedAudioLoc && !state.cleanedAudioLoc.startsWith('http')) {
                audioDriveUrl = await withRetry(() => driveService.uploadFile(state.cleanedAudioLoc!, 'audio/mpeg', driveFolderId), 'Drive Upload Audio');
            }
            if (state.videoLoc && !state.videoLoc.startsWith('http')) {
                videoDriveUrl = await withRetry(() => driveService.uploadFile(state.videoLoc!, 'video/mp4', driveFolderId), 'Drive Upload Video');
            }
            // State URLs are safely rewritten as standard HTTP links inside the Payload logic
            logger.info('All assets successfully backed up to Google Drive Cloud CMS.');
        } catch (e: any) {
             logger.error(`Failed to upload to Google Drive CMS, falling back to local paths for Spreadsheet Log: ${e.message}`);
        }
    }

    // STEP 5: Log to Google Sheets (Human-In-The-Loop)
    if (!state.sheetLogged) {
        const sheetsService = new SheetsService();
        const tabName = process.env.GOOGLE_SHEETS_TAB_NAME || 'Podcasts';
        const todayStr = new Date().toLocaleDateString('en-US');
        const combinedShowNotes = `${state.showNotes.summary}\n\nTimestamps:\n${state.showNotes.timestamps.join('\n')}`;

        const rowPayload = [
            state.showNotes.title,                 // A: title
            combinedShowNotes,                     // B: show notes
            state.showNotes.hashtags,              // C: hashtags
            state.showNotes.keywords,              // D: keywords
            squareArtDriveUrl || 'N/A',            // E: episode_art (Now a Drive Link!)
            videoDriveUrl || audioDriveUrl || 'N/A', // F: dropbox_url (Now a Drive Link!)
            "no",                                  // G: approved?
            "no",                                  // H: posted?
            todayStr,                              // I: publish_date
            landscapeThumbDriveUrl || 'N/A'        // J: youtube_thumbnail (Now a Drive Link!)
        ];

        await sheetsService.appendRow(tabName, rowPayload);
        state.sheetLogged = true;
        saveState(pipelineId, state);
        logger.info(`Phase 1 Generator Finished! Row appended to Google Sheet for HUMAN REVIEW.`);
    } else {
        logger.info(`Skipping Sheets. Episode already logged for review.`);
    }

    logger.info('Pipeline finished successfully. Awaiting Phase 2 Poll.');
  } catch (error) {
    logger.error(`Pipeline failed. State saved to .state-${pipelineId}.json. Fix the issue and run the same command to resume from where it failed.`);
    process.exit(1);
  }
}

if (require.main === module) {
    const inputPath = process.argv[2];
    if (!inputPath) {
        logger.error('Usage: ts-node src/index.ts <path-to-audio-file>');
        process.exit(1);
    }
    runPipeline(inputPath).catch(e => {
        logger.error(`Fatal error in pipeline: ${e.message}`);
        process.exit(1);
    });
}
