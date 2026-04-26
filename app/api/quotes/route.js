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

export async function POST(req) {
  try {
    const body = await req.json();
    const { customerName, blinds, subtotal, extrasTotal, grandTotal } = body;

    if (!customerName || !blinds) {
      return NextResponse.json({ error: 'Customer Name and blinds are required' }, { status: 400 });
    }

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.MASTER_SPREADSHEET_ID;

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
