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

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Creating spreadsheet via Drive API...');
    const file = await drive.files.create({
      requestBody: { 
        name: 'Test Sheets via Drive', 
        mimeType: 'application/vnd.google-apps.spreadsheet' 
      }
    });
    
    const spreadsheetId = file.data.id;
    console.log('Created sheet ID:', spreadsheetId);

    console.log('Attempting to write data via Sheets API...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1', // Default sheet is usually 'Sheet1'
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Hello World']]
      }
    });
    console.log('Successfully wrote to sheet!');

  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
