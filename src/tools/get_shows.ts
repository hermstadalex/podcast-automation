import axios from 'axios';
import fs from 'fs';
import { config } from 'dotenv';
import path from 'path';

config();

const API_TOKEN = process.env.CAPTIVATE_API_TOKEN;
const USER_ID = process.env.CAPTIVATE_USER_ID;

async function execute() {
    if (!API_TOKEN || !USER_ID) {
        console.error('Missing CAPTIVATE_API_TOKEN or CAPTIVATE_USER_ID in .env');
        process.exit(1);
    }

    try {
        console.log(`Authenticating with Captivate...`);
        const authRes = await axios.post('https://api.captivate.fm/authenticate/token', {
            username: USER_ID,
            token: API_TOKEN
        });
        const bearerToken = authRes.data.user.token;
        
        console.log(`Fetching shows for user ${USER_ID}...`);
        
        let url = `https://api.captivate.fm/users/${USER_ID}/shows`;
        let response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        
        let shows = response.data?.shows || response.data?.data || response.data;
        
        if (!Array.isArray(shows) && shows?.shows) {
            shows = shows.shows;
        }

        if (!Array.isArray(shows)) {
             console.log("Response format unexpected. Trying generic /shows endpoint...");
             const fallbackResponse = await axios.get(`https://api.captivate.fm/shows`, {
                 headers: { 'Authorization': `Bearer ${API_TOKEN}` }
             });
             shows = fallbackResponse.data?.shows || fallbackResponse.data?.data || fallbackResponse.data;
        }

        if (!Array.isArray(shows)) {
             console.error("Could not parse array of shows. Raw response keys:", Object.keys(shows || {}));
             return;
        }

        console.log(`Found ${shows.length} shows! Writing to CSV...`);
        
        let csvContent = 'Show Name,Show ID\n';
        for (const show of shows) {
            const title = show.title || show.show_title || show.name || 'Unknown Title';
            const id = show.id || show.show_id || 'Unknown ID';
            const safeTitle = `"${title.replace(/"/g, '""')}"`;
            csvContent += `${safeTitle},${id}\n`;
        }

        const outPath = path.join(process.cwd(), 'captivate_shows.csv');
        fs.writeFileSync(outPath, csvContent);
        
        console.log(`CSV successfully created at ${outPath}`);
    } catch (error: any) {
        console.error('Failed to fetch shows:', error.message);
        if (error.response) {
            console.error(error.response.data);
        }
    }
}

execute();
