import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { config } from 'dotenv';
config();

async function check() {
    const apiToken = process.env.CAPTIVATE_API_TOKEN;
    const userId = process.env.CAPTIVATE_USER_ID;
    const showId = process.env.CAPTIVATE_SHOW_ID;

    if (!apiToken || !userId || !showId) return console.error('Missing tokens');

    const authRes = await axios.post('https://api.captivate.fm/authenticate/token', {
        username: userId,
        token: apiToken
    });
    const bearer = authRes.data.user.token;

    // Create a dummy image
    fs.writeFileSync('/tmp/dummy.jpg', 'fake image data');
    const mediaForm = new FormData();
    mediaForm.append('file', fs.createReadStream('/tmp/dummy.jpg'), { filename: 'dummy.jpg', contentType: 'image/jpeg' });
    
    try {
        console.log("Testing image upload to /media...");
        const res = await axios.post(`https://api.captivate.fm/shows/${showId}/media`, mediaForm, {
            headers: { ...mediaForm.getHeaders(), Authorization: `Bearer ${bearer}` }
        });
        console.log("Success! Image Media ID:", res.data.media.id);
    } catch(e: any) {
        console.log("Failed image upload:", e.response?.data || e.message);
    }
}
check();
