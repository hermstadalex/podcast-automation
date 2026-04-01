import axios from 'axios';

const USER_ID = 'a82607e9-a3f8-47f7-ab01-3ff833878065';
const TOKEN = 'YVuXEcEUorah5TbrvfcHz156eRxKpqGapUEHKcIq';

async function test(headers: any) {
    try {
        const res = await axios.get(`https://api.captivate.fm/users/${USER_ID}/shows`, { headers });
        console.log('SUCCESS with headers:', headers);
        return true;
    } catch(e: any) {
        console.log('FAILED with headers:', Object.keys(headers), e.response?.status);
        return false;
    }
}

async function run() {
    console.log('Testing /users/ID/shows endpoint directly...');
    if (await test({ 'Authorization': `Bearer ${TOKEN}` })) return;
    if (await test({ 'Authorization': `Bearer ${USER_ID}:${TOKEN}` })) return;
    if (await test({ 'Authorization': `Token ${TOKEN}` })) return;
    if (await test({ 'X-User-Id': USER_ID, 'X-Api-Key': TOKEN })) return;
    if (await test({ 'Authorization': `Bearer ${TOKEN}`, 'User-Id': USER_ID })) return;
}
run();
