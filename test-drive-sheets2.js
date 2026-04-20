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
    
    console.log('Creating spreadsheet directly in folder...');
    const file = await drive.files.create({
      requestBody: { 
        name: 'Test Sheets via Drive', 
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['1RzlUv-hhxbmFE_6Kur5b39fd1i7HORNQ']
      },
      supportsAllDrives: true,
    });
    
    console.log('Created sheet ID:', file.data.id);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
