import axios from 'axios';

const USER_ID = 'a82607e9-a3f8-47f7-ab01-3ff833878065';
const TOKEN = 'YVuXEcEUorah5TbrvfcHz156eRxKpqGapUEHKcIq';

async function run() {
    try {
        const authRes = await axios.post('https://api.captivate.fm/authenticate/token', {
            username: USER_ID,
            token: TOKEN
        });
        console.log("SUCCESS");
        console.log(JSON.stringify(authRes.data, null, 2));
    } catch(e: any) {
        console.log('FAILED:', e.response?.status, JSON.stringify(e.response?.data, null, 2));
    }
}
run();
