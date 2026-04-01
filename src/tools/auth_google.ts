import { google } from 'googleapis';
import { config } from 'dotenv';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

config();

const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
];
const TOKEN_PATH = path.join(__dirname, '../../.google_tokens.json');

async function authGoogle() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId.includes('YOUR_')) {
        console.error('FATAL: You must replace GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env before running this script!');
        process.exit(1);
    }

    const oAuth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob' // Offline mode for Desktop Apps
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Forces it to issue a refresh token every time
    });

    console.log('\n=======================================');
    console.log('🔗 GOOGLE API OAUTH 2.0 AUTHORIZATION');
    console.log('=======================================\n');
    console.log('Please authorize this Mac Mini to act natively on behalf of your personal Google account:\n');
    console.log(authUrl);
    console.log('\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Paste the authorization code Google gave you: ', async (code) => {
        rl.close();
        
        try {
            const { tokens } = await oAuth2Client.getToken(code.trim());
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log('\n✅ SUCCESS: Identity Lock Achieved! Tokens perfectly saved to .google_tokens.json');
            console.log('The daemons will now seamlessly bypass all Service Account Workspace limits by impersonating your actual account!');
        } catch (err: any) {
             console.error('Failed to parse Token Code:', err.message);
        }
    });
}

authGoogle();
