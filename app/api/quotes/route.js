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

async function ensureSummaryTab(sheets, spreadsheetId) {
  const tabTitle = 'Quotes Summary';
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === tabTitle);
  
  if (sheet) return sheet.properties.sheetId;

  const addSheetResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabTitle, gridProperties: { frozenRowCount: 1 } } } }]
    }
  });
  
  const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabTitle}'!A1:E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['Date', 'Customer Name', 'Blinds Subtotal', 'Extras Total', 'Grand Total']] }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat(textFormat)'
          }
        },
        {
          addBanding: {
            bandedRange: {
              range: { sheetId: newSheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 5 },
              rowProperties: {
                headerColor: { red: 0.83, green: 0.68, blue: 0.21 }, // Gold
                firstBandColor: { red: 1, green: 1, blue: 1 },
                secondBandColor: { red: 0.98, green: 0.96, blue: 0.93 },
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

    if (!customer) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.QUOTES_SPREADSHEET_ID || process.env.MASTER_SPREADSHEET_ID;

    if (!masterSpreadsheetId) {
      return NextResponse.json({ error: 'Spreadsheet ID is not configured.' }, { status: 500 });
    }

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: masterSpreadsheetId });
    const tabNames = spreadsheet.data.sheets.map(s => s.properties.title);

    if (!tabNames.includes(customer)) {
      return NextResponse.json({ blinds: null }); // No saved quote exists
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customer}'!A2:L`,
    });

    const rows = response.data.values || [];
    const blinds = rows.map((row, index) => ({
      id: Date.now() + index,
      location: row[1] || '',
      width: row[2] || '',
      height: row[3] || '',
      mountType: row[4] || 'Inside',
      colorCode: row[5] || '',
      mechanism: row[6] || 'Manual',
      blindType: row[7] || '',
      notes: row[8] || '',
      factoryCost: Number(row[9]?.replace(/[^0-9.-]+/g,"")) || 0,
      upcharge: Number(row[10]?.replace(/[^0-9.-]+/g,"")) || 0,
      finalPrice: Number(row[11]?.replace(/[^0-9.-]+/g,"")) || 0
    }));

    return NextResponse.json({ blinds });

  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { customerName, blinds, subtotal, extrasTotal, grandTotal } = body;

    if (!customerName || !blinds) {
      return NextResponse.json({ error: 'Customer Name and blinds are required' }, { status: 400 });
    }

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.QUOTES_SPREADSHEET_ID || process.env.MASTER_SPREADSHEET_ID;

    // 1. Log to Quotes Summary
    await ensureSummaryTab(sheets, masterSpreadsheetId);
    
    const dateStr = new Date().toLocaleDateString('en-US');
    await sheets.spreadsheets.values.append({
      spreadsheetId: masterSpreadsheetId,
      range: `'Quotes Summary'!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[dateStr, customerName, `$${subtotal.toFixed(2)}`, `$${extrasTotal.toFixed(2)}`, `$${grandTotal.toFixed(2)}`]]
      }
    });

    // 2. Update Customer's Tab with Pricing
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: masterSpreadsheetId });
    const customerSheet = spreadsheet.data.sheets.find(s => s.properties.title === customerName);
    let sheetId = customerSheet ? customerSheet.properties.sheetId : null;

    if (!sheetId) {
      const addSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: masterSpreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: customerName, gridProperties: { frozenRowCount: 1 } } } }] }
      });
      sheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
      
      // Basic formatting for new customer tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: masterSpreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat(textFormat)'
              }
            }
          ]
        }
      });
    }

    // Write headers (A through L)
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A1:L1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Customer Name', 'Location', 'Width', 'Height', 'Mount Type', 'Color Code', 'Mechanism', 'Blind Type', 'Notes', 'Factory Cost', 'Upcharges/Surcharges', 'Final Price']]
      }
    });

    // Prepare rows
    const rows = blinds.map(b => [
      customerName, b.location, b.width, b.height, b.mountType, b.colorCode, b.mechanism, b.blindType, b.notes || '',
      `$${b.factoryCost?.toFixed(2) || '0.00'}`,
      `$${b.upcharge?.toFixed(2) || '0.00'}`,
      `$${b.finalPrice?.toFixed(2) || '0.00'}`
    ]);

    // Clear existing data from A2:L
    await sheets.spreadsheets.values.clear({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A2:L`,
    });

    // Write new data
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A2:L`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });

    return NextResponse.json({ success: true, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${masterSpreadsheetId}/edit#gid=${sheetId}` });

  } catch (error) {
    console.error('Error saving quote:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
