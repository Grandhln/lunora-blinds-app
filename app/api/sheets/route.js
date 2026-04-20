import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const FOLDER_ID = '1RzlUv-hhxbmFE_6Kur5b39fd1i7HORNQ';

export async function POST(req) {
  try {
    const body = await req.json();
    const { customerName, blinds } = body;

    if (!customerName || !blinds || blinds.length === 0) {
      return NextResponse.json({ error: 'Customer Name and at least one blind are required' }, { status: 400 });
    }

    // Initialize Google Auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // We will store the master spreadsheet ID in the environment variables
    const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;
    
    if (!masterSpreadsheetId) {
      return NextResponse.json({ error: 'Master Spreadsheet ID is not configured.' }, { status: 500 });
    }

    // 1. Create a new Tab (Sheet) for the Customer
    const tabTitle = `${customerName} - ${new Date().toLocaleDateString().replaceAll('/', '-')}`;
    
    let sheetId;
    try {
      const addSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: masterSpreadsheetId,
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
      sheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
    } catch (e) {
      // If a tab with this exact name already exists, fallback to appending a random string
      if (e.message.includes('already exists')) {
        const fallbackTitle = `${tabTitle} (${Math.floor(Math.random() * 1000)})`;
        const fallbackResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: masterSpreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: fallbackTitle, gridProperties: { frozenRowCount: 1 } }
                }
              }
            ]
          }
        });
        sheetId = fallbackResponse.data.replies[0].addSheet.properties.sheetId;
      } else {
        throw e;
      }
    }

    // 2. Add headers and formatting
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSpreadsheetId,
      range: `'${tabTitle}'!A1:H1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          ['Customer Name', 'Location', 'Width', 'Height', 'Mount Type', 'Color Code', 'Mechanism', 'Blind Type']
        ]
      }
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: masterSpreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 8,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.83, green: 0.68, blue: 0.21 }, // #D4AF37
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }
        ]
      }
    });

    // 3. Prepare rows from the array of blinds
    const rows = blinds.map(b => [
      customerName, b.location, b.width, b.height, b.mountType, b.colorCode, b.mechanism, b.blindType
    ]);

    // 4. Add the data rows
    await sheets.spreadsheets.values.append({
      spreadsheetId: masterSpreadsheetId,
      range: `'${tabTitle}'!A2:H`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows
      }
    });

    return NextResponse.json({ 
      success: true, 
      spreadsheetId: masterSpreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${masterSpreadsheetId}/edit`
    });

  } catch (error) {
    console.error('Error creating Google Sheet:', error);
    return NextResponse.json({ error: error.message || 'Failed to create Google Sheet' }, { status: 500 });
  }
}
