import axios from 'axios';
import { config } from 'dotenv';
config();

const API_TOKEN = process.env.CAPTIVATE_API_TOKEN;
const USER_ID = process.env.CAPTIVATE_USER_ID;
const SHOW_ID = process.env.CAPTIVATE_SHOW_ID;

async function test() {
    console.log('Authenticating...');
    const authRes = await axios.post('https://api.captivate.fm/authenticate/token', {
        username: USER_ID,
        token: API_TOKEN
    });
    const bearer = authRes.data.user.token;
    
    try {
        const FormData = require('form-data');
        const fs = require('fs');
        const form = new FormData();
        const filePath = '/tmp/auphonic_cleaned_smBdgWtcJXDeTXohQKaJdB.mp3';
        form.append('file', fs.createReadStream(filePath), { 
            filename: 'episode.mp3',
            contentType: 'audio/mpeg'
        });
        
        const res = await axios.post(`https://api.captivate.fm/shows/${SHOW_ID}/media`, form, {
            headers: { 
                ...form.getHeaders(),
                'Authorization': `Bearer ${bearer}` 
            }
        });
        console.log('media success!', res.data);
    } catch (e: any) {
        console.log('media upload:', e.response?.status, JSON.stringify(e.response?.data));
    }
}
test();
