import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
}

export async function GET() {
  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

    if (!masterSpreadsheetId) {
      return NextResponse.json({ error: 'Master Spreadsheet ID is not configured.' }, { status: 500 });
    }

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: masterSpreadsheetId });
    const tabNames = spreadsheet.data.sheets.map(s => s.properties.title);

    if (!tabNames.includes('App Settings')) {
      return NextResponse.json({ settings: null });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSpreadsheetId,
      range: `'App Settings'!A1`,
    });

    const values = response.data.values;
    if (!values || !values[0] || !values[0][0]) {
      return NextResponse.json({ settings: null });
    }

    const settings = JSON.parse(values[0][0]);
    return NextResponse.json({ settings });

  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { settings } = body;

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

    if (!masterSpreadsheetId) {
      return NextResponse.json({ error: 'Master Spreadsheet ID is not configured.' }, { status: 500 });
    }

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: masterSpreadsheetId });
    const tabNames = spreadsheet.data.sheets.map(s => s.properties.title);

    // If tab doesn't exist, create it
    if (!tabNames.includes('App Settings')) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: masterSpreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'App Settings' } } }]
        }
      });
    }

    const settingsJson = JSON.stringify(settings);
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSpreadsheetId,
      range: `'App Settings'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[settingsJson]]
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
