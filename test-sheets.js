const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function test() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Attempting to create sheet...');
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: { properties: { title: 'Test from script' } }
    });
    
    console.log('Created sheet ID:', spreadsheet.data.spreadsheetId);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
