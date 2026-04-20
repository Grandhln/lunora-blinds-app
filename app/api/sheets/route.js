import { google } from 'googleapis';
import { NextResponse } from 'next/server';

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

// Helper to handle existing vs new tabs
async function ensureSheetExistsAndFormatted(sheets, spreadsheetId, tabTitle) {
  // 1. Check if tab exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === tabTitle);
  
  if (sheet) {
    return sheet.properties.sheetId; // Already exists
  }

  // 2. Create new tab with formatting if it doesn't exist
  const addSheetResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabTitle,
              gridProperties: { frozenRowCount: 1 }
            }
          }
        }
      ]
    }
  });
  
  const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabTitle}'!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['Customer Name', 'Location', 'Width', 'Height', 'Mount Type', 'Color Code', 'Mechanism', 'Blind Type', 'Notes']]
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Bold header
        {
          repeatCell: {
            range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
              }
            },
            fields: 'userEnteredFormat(textFormat)'
          }
        },
        // Banding (Alternating row colors)
        {
          addBanding: {
            bandedRange: {
              range: { sheetId: newSheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 9 },
              rowProperties: {
                headerColor: { red: 0.83, green: 0.68, blue: 0.21 }, // #D4AF37 Gold Header
                firstBandColor: { red: 1, green: 1, blue: 1 }, // White
                secondBandColor: { red: 0.98, green: 0.96, blue: 0.93 }, // Very Light Gold/Grey
              }
            }
          }
        }
      ]
    }
  });

  return newSheetId;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const customer = searchParams.get('customer');

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

    if (!masterSpreadsheetId) {
      return NextResponse.json({ error: 'Master Spreadsheet ID is not configured.' }, { status: 500 });
    }

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: masterSpreadsheetId });
    const tabNames = spreadsheet.data.sheets.map(s => s.properties.title);

    // If no specific customer is requested, just return the list of customers (tabs)
    // We filter out any default "Sheet1" if it exists and is empty, but let's just return all for now.
    if (!customer) {
      return NextResponse.json({ customers: tabNames });
    }

    // If a customer is specified, fetch their data
    if (!tabNames.includes(customer)) {
      return NextResponse.json({ blinds: [] }); // Customer doesn't exist yet
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customer}'!A2:I`, // Skip header
    });

    const rows = response.data.values || [];
    const blinds = rows.map((row, index) => ({
      id: Date.now() + index, // Generate temporary ID for the frontend list
      location: row[1] || '',
      width: row[2] || '',
      height: row[3] || '',
      mountType: row[4] || 'Inside',
      colorCode: row[5] || '',
      mechanism: row[6] || 'Manual',
      blindType: row[7] || '',
      notes: row[8] || ''
    }));

    return NextResponse.json({ blinds });

  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { customerName, blinds } = body;

    if (!customerName || !blinds || blinds.length === 0) {
      return NextResponse.json({ error: 'Customer Name and at least one blind are required' }, { status: 400 });
    }

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

    if (!masterSpreadsheetId) {
      return NextResponse.json({ error: 'Master Spreadsheet ID is not configured.' }, { status: 500 });
    }

    // Ensure the tab exists and is formatted
    const sheetId = await ensureSheetExistsAndFormatted(sheets, masterSpreadsheetId, customerName);

    // Prepare rows from the array of blinds
    const rows = blinds.map(b => [
      customerName, b.location, b.width, b.height, b.mountType, b.colorCode, b.mechanism, b.blindType, b.notes || ''
    ]);

    // Clear existing data (to support editing/deletion of rows)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A2:I`,
    });

    // Write new data
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A2:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });

    return NextResponse.json({ 
      success: true, 
      spreadsheetId: masterSpreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${masterSpreadsheetId}/edit#gid=${sheetId}`
    });

  } catch (error) {
    console.error('Error writing to Google Sheet:', error);
    return NextResponse.json({ error: error.message || 'Failed to create Google Sheet' }, { status: 500 });
  }
}
