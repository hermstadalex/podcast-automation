import axios from 'axios';
import { config } from 'dotenv';
config();

async function check() {
    const apiToken = process.env.CAPTIVATE_API_TOKEN;
    const userId = process.env.CAPTIVATE_USER_ID;
    const showId = process.env.CAPTIVATE_SHOW_ID;

    if (!apiToken || !userId) return console.error('Missing tokens');

    const authRes = await axios.post('https://api.captivate.fm/authenticate/token', {
        username: userId,
        token: apiToken
    });
    const bearer = authRes.data.user.token;

    const epsRes = await axios.get(`https://api.captivate.fm/shows/${showId}/episodes`, {
        headers: { Authorization: `Bearer ${bearer}` }
    });
    
    if (epsRes.data.episodes && epsRes.data.episodes.length > 0) {
        // Output Keys of the most recently published episode to reverse-engineer correct property formatting
        console.log(JSON.stringify(epsRes.data.episodes[0], null, 2));
    } else {
        console.log("No episodes found to inspect.");
    }
}
check().catch(console.error);
