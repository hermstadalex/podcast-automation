import axios from 'axios';
import { config } from 'dotenv';
config();

async function listModels() {
    try {
        const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        console.log(res.data.models.map((m: any) => ({ name: m.name, methods: m.supportedGenerationMethods })));
    } catch (e: any) {
        console.error(e.response?.data || e.message);
    }
}
listModels();
