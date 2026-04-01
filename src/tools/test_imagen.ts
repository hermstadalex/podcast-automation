import axios from 'axios';
import { config } from 'dotenv';
config();

async function testImagen() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`;
        const res = await axios.post(url, {
            instances: [
                { prompt: "A highly detailed podcast cover art showing a microphone." }
            ],
            parameters: {
                sampleCount: 1
            }
        });
        console.log("SUCCESS!", res.data);
    } catch (e: any) {
        console.error("ERROR:", e.response?.data || e.message);
    }
}
testImagen();
