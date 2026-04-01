import { google } from 'googleapis';
import { config } from 'dotenv';
import readline from 'readline';

config();

// To run this: npx ts-node src/tools/auth_youtube.ts
async function runAuthFlow() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob' // Desktop/ClI redirect flow
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Forces it to return a refresh token
        scope: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
        ]
    });

    console.log('----------------------------------------------------');
    console.log('1. Open this URL in your browser to authorize the app:');
    console.log(authUrl);
    console.log('----------------------------------------------------');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('2. Enter the authorization code provided after login: ', async (code) => {
        try {
            const { tokens } = await oauth2Client.getToken(code);
            console.log('\n✅ SUCCESS! Copy this refresh token into your .env file:');
            console.log(`\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
        } catch (error: any) {
            console.error('\n❌ Error retrieving token:', error.response?.data || error.message);
        }
        rl.close();
    });
}

runAuthFlow();
