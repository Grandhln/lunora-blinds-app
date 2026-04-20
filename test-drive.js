const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function test() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });
    
    console.log('Attempting to create file...');
    const file = await drive.files.create({
      requestBody: { name: 'Test from script', mimeType: 'text/plain' }
    });
    
    console.log('Created file ID:', file.data.id);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
