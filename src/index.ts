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

export async function runPipeline(inputPath: string, manualId?: string, clientCode?: string) {
  logger.info(`Starting Phase 1 pipeline for: ${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    logger.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const pipelineId = manualId || path.basename(inputPath, path.extname(inputPath)).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  let state: PipelineState = loadState(pipelineId);
  
  if (clientCode) {
      // Force Client Code override into state memory permanently so human edits aren't lost on resume constraints
      if (!state.showNotes) {
          state.showNotes = {} as any;
      }
      state.showNotes.clientName = clientCode;
      saveState(pipelineId, state);
  }

  try {
    // STEP 1: Gemini Text Extraction (on Raw Audio)
    if (!state.showNotes || !state.showNotes.summary) {
        const geminiService = new GeminiService();
        const generatedNotes = await withRetry(() => geminiService.generateShowNotes(inputPath), 'Gemini Extraction');
        
        // Ensure we preserve the organically inherited ClientName that we injected natively before Gemini executed
        state.showNotes = { ...generatedNotes, clientName: state.showNotes?.clientName };
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
    const outputVaultRootId = process.env.GOOGLE_DRIVE_OUTPUT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (outputVaultRootId) {
        logger.info('Commencing Cloud CMS Upload Phase...');
        try {
            // Natively traverse the Google Drive directory tree down to the specific Episode Hub
            const safeClientName = (state.showNotes.clientName || 'Unknown Client').replace(/[/\\?%*:|"<>]/g, '-');
            const clientFolderId = await withRetry(() => driveService.getOrCreateFolder(outputVaultRootId, safeClientName), 'Create Client Folder');
            
            const safeTitle = (state.showNotes.title || 'Untitled Episode').replace(/[/\\?%*:|"<>]/g, '-').substring(0, 60);
            const episodeFolderId = await withRetry(() => driveService.getOrCreateFolder(clientFolderId, safeTitle), 'Create Episode Folder');

            if (state.imageLoc && !state.imageLoc.startsWith('http')) {
                squareArtDriveUrl = await withRetry(() => driveService.uploadFile(state.imageLoc!, 'image/jpeg', episodeFolderId), 'Drive Upload Square Art');
            }
            if (state.youtubeThumbLoc && !state.youtubeThumbLoc.startsWith('http')) {
                landscapeThumbDriveUrl = await withRetry(() => driveService.uploadFile(state.youtubeThumbLoc!, 'image/jpeg', episodeFolderId), 'Drive Upload Landscape Thumb');
            }
            if (state.cleanedAudioLoc && !state.cleanedAudioLoc.startsWith('http')) {
                audioDriveUrl = await withRetry(() => driveService.uploadFile(state.cleanedAudioLoc!, 'audio/mpeg', episodeFolderId), 'Drive Upload Audio');
            }
            if (state.videoLoc && !state.videoLoc.startsWith('http')) {
                videoDriveUrl = await withRetry(() => driveService.uploadFile(state.videoLoc!, 'video/mp4', episodeFolderId), 'Drive Upload Video');
            }
            logger.info(`All assets beautifully nested inside the Cloud CMS Vault at: /${safeClientName}/${safeTitle}/`);
        } catch (e: any) {
             logger.error(`Failed to execute Drive upload traversal, falling back to local paths for Spreadsheet Log: ${e.message}`);
        }
    }

    // STEP 5: Log to Client's ISOLATED Google Sheets (Human-In-The-Loop)
    if (!state.sheetLogged) {
        let approvalSpreadsheetId: string | null = null;
        if (state.showNotes.clientName) {
            const routerService = new SheetsService(process.env.GOOGLE_SHEETS_CLIENTS_ID);
            const clientsTab = await routerService.getRows('Clients').catch(() => []);
            for (const r of clientsTab) {
                if (r[0] && r[0].toString().toUpperCase().trim() === state.showNotes.clientName.toUpperCase().trim()) {
                    approvalSpreadsheetId = r[3]; // Column D houses the isolated Spreadsheet ID!
                    break;
                }
            }
        }

        if (!approvalSpreadsheetId) {
             logger.warn(`Could not locate an Approval Spreadsheet URL mapped to Client [${state.showNotes.clientName}]. Falling back to Default .env!`);
             approvalSpreadsheetId = process.env.GOOGLE_SHEETS_ID || null;
        }

        if (!approvalSpreadsheetId) {
             logger.error('CRITICAL: No Approval Spreadsheet found and default is missing. Cannot proceed with appending output!');
             process.exit(1);
        }

        const clientSheetService = new SheetsService(approvalSpreadsheetId);
        const tabName = process.env.GOOGLE_SHEETS_TAB_NAME || 'Podcasts';

        const todayStr = new Date().toLocaleDateString('en-US');
        const formattedTimestamps = state.showNotes.timestamps.map((t: any) => {
            if (typeof t === 'string') return t;
            if (typeof t === 'object' && t !== null) {
                const time = t.time || t.timestamp || t.start || '';
                const desc = t.description || t.topic || t.title || t.text || '';
                return `${time} - ${desc}`.trim();
            }
            return String(t);
        });

        const combinedShowNotes = `${state.showNotes.summary}\n\n**Timestamps:**\n${formattedTimestamps.map((t: string) => `- ${t}`).join('\n')}`;

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
            landscapeThumbDriveUrl || 'N/A',       // J: youtube_thumbnail (Now a Drive Link!)
            state.showNotes.clientName || 'PRP'    // K: client_code
        ];

        await clientSheetService.appendRow(tabName, rowPayload);
        state.sheetLogged = true;
        saveState(pipelineId, state);
        logger.info(`Phase 1 Generator Finished! Row elegantly appended to Client [${state.showNotes.clientName}] explicitly for HUMAN REVIEW.`);
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
