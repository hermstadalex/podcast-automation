import { google } from 'googleapis';
import path from 'path';
import { logger } from '../utils/logger';

export class SheetsService {
    private sheets: any;
    private spreadsheetId: string;

    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEETS_ID || '';
        
        // Search for the JSON key that was verified in the tracker project
        // Or expect it directly in the root of podcast-automation
        const keyFilePath = path.join(__dirname, '../../service_account.json');
        
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: keyFilePath,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            this.sheets = google.sheets({ version: 'v4', auth });
        } catch (e: any) {
            logger.error(`Could not initialize Sheets API. Make sure service_account.json is present.`);
        }
    }

    async appendRow(tabName: string, rowData: string[]) {
        if (!this.spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not set in .env');

        const range = `${tabName}!A:Z`;
        const request = {
            spreadsheetId: this.spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [rowData],
            },
        };

        try {
            const response = await this.sheets.spreadsheets.values.append(request);
            logger.info(`Appended row to ${tabName}. Range updated: ${response.data?.updates?.updatedRange}`);
            return response.data;
        } catch (error: any) {
            logger.error(`Google Sheets appending failed: ${error.message}`);
            throw error;
        }
    }

    async getRows(tabName: string): Promise<any[][]> {
        if (!this.spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not set in .env');
        const range = `${tabName}!A:Z`;
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range,
            });
            return response.data.values || [];
        } catch (error: any) {
            logger.error(`Google Sheets read failed: ${error.message}`);
            throw error;
        }
    }

    async updateCell(tabName: string, rowNumber: number, columnLetter: string, value: string) {
        if (!this.spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not set in .env');
        const range = `${tabName}!${columnLetter}${rowNumber}`;

        const request = {
            spreadsheetId: this.spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[value]]
            }
        };

        try {
            await this.sheets.spreadsheets.values.update(request);
            logger.info(`Updated cell ${range} with value: ${value}`);
        } catch (error: any) {
            logger.error(`Google Sheets cell update failed: ${error.message}`);
            throw error;
        }
    }
}
