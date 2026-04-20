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
      requestBody: { name: 'Test Drive Move', mimeType: 'text/plain' }
    });
    
    console.log('Created file ID:', file.data.id);

    const fileMeta = await drive.files.get({
      fileId: file.data.id,
      fields: 'parents'
    });
    const previousParents = fileMeta.data.parents ? fileMeta.data.parents.join(',') : '';

    const FOLDER_ID = '1TT8aHcEtNI6kJiqGcX3tcBQOfC70kcAS';
    const updateParams = {
      fileId: file.data.id,
      addParents: FOLDER_ID,
      fields: 'id, parents',
      supportsAllDrives: true,
    };
    if (previousParents) {
      updateParams.removeParents = previousParents;
    }

    await drive.files.update(updateParams);
    console.log('Successfully moved to folder!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
