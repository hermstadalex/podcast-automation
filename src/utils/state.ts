import fs from 'fs';
import path from 'path';

export interface PipelineState {
    cleanedAudioLoc?: string;
    showNotes?: any;
    imageLoc?: string;
    videoLoc?: string;
    youtubeThumbLoc?: string;
    youtubeUrl?: string;
    captivatePublished?: boolean;
    sheetLogged?: boolean;
}

export function loadState(id: string): PipelineState {
    const file = path.join(process.cwd(), `.state-${id}.json`);
    if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return {};
}

export function saveState(id: string, state: PipelineState) {
    const file = path.join(process.cwd(), `.state-${id}.json`);
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
}
