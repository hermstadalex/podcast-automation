import axios from 'axios';
import { config } from 'dotenv';
config();

async function check() {
    const apiToken = process.env.CAPTIVATE_API_TOKEN;
    const userId = process.env.CAPTIVATE_USER_ID;
    const showId = process.env.CAPTIVATE_SHOW_ID;

    const authRes = await axios.post('https://api.captivate.fm/authenticate/token', { username: userId, token: apiToken });
    const bearer = authRes.data.user.token;

    try {
        const payload = {
            shows_id: showId,
            media_id: "6551fa6a-df94-46c1-9227-e6ec86853440", // using previous media
            title: "Test Episode Art Injection",
            summary: "summary goes here",
            shownotes: "notes go here",
            status: "Draft",
            episode_art: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        };

        const res = await axios.post('https://api.captivate.fm/episodes', payload, {
            headers: { Authorization: `Bearer ${bearer}` }
        });
        console.log("Success! Created with Base64 episode_art.");
        return;
    } catch(e: any) {
        console.log("Base64 Failed:", e.response?.data || e.message);
    }
}
check();
