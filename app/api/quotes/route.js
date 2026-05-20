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
    requestBody: { values: [['Date', 'Customer Name', 'Extras Total', 'Options Info', 'Grand Totals']] }
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
      range: `'${customer}'!A1:ZZ`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return NextResponse.json({ blinds: null });
    
    // Parse headers to find columns
    const headers = rows[0] || [];
    const quoteColumns = [];
    
    // Header format: J=OptionName Type/Mech, K=OptionName Factory Cost...
    for (let i = 9; i < headers.length; i += 4) {
       const colName = headers[i]?.replace(' Type/Mech', '') || `Option ${(i-9)/4 + 1}`;
       quoteColumns.push({ id: `col_${i}`, name: colName, blindType: '', mechanism: '' });
    }

    const pricingData = {};
    const blinds = [];

    rows.slice(1).forEach((row, index) => {
      const blindId = Date.now() + index;
      blinds.push({
        id: blindId,
        location: row[1] || '',
        width: row[2] || '',
        height: row[3] || '',
        mountType: row[4] || 'Inside',
        colorCode: row[5] || '',
        mechanism: row[6] || 'Manual',
        blindType: row[7] || '',
        notes: row[8] || ''
      });
      
      pricingData[blindId] = {};
      
      if (quoteColumns.length === 0) {
         // Fallback for old sheets before the update
         pricingData[blindId]['col_1'] = {
            factoryCost: Number(row[9]?.replace(/[^0-9.-]+/g,"")) || 0,
            manualUpcharge: Number(row[10]?.replace(/[^0-9.-]+/g,"")) || 0
         };
         if (quoteColumns.length === 0) quoteColumns.push({ id: 'col_1', name: 'Option 1', blindType: '', mechanism: '' });
      } else {
         quoteColumns.forEach((col, colIndex) => {
           const offset = 9 + (colIndex * 4);
           pricingData[blindId][col.id] = {
             factoryCost: Number(row[offset + 1]?.replace(/[^0-9.-]+/g,"")) || 0,
             manualUpcharge: Number(row[offset + 2]?.replace(/[^0-9.-]+/g,"")) || 0
           };
         });
      }
    });

    return NextResponse.json({ blinds, quoteColumns, pricingData });

  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { customerName, blinds, quoteColumns, subtotals, extrasTotal, grandTotals } = body;

    if (!customerName || !blinds) {
      return NextResponse.json({ error: 'Customer Name and blinds are required' }, { status: 400 });
    }

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.QUOTES_SPREADSHEET_ID || process.env.MASTER_SPREADSHEET_ID;

    // 1. Log to Quotes Summary
    await ensureSummaryTab(sheets, masterSpreadsheetId);
    
    const dateStr = new Date().toLocaleDateString('en-US');
    const optionsInfo = quoteColumns ? quoteColumns.map(c => c.name).join(' | ') : 'Default';
    const grandTotalsStr = grandTotals ? Object.values(grandTotals).map(v => `$${v.toFixed(2)}`).join(' | ') : '0';
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: masterSpreadsheetId,
      range: `'Quotes Summary'!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[dateStr, customerName, `$${(extrasTotal||0).toFixed(2)}`, optionsInfo, grandTotalsStr]]
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

    // Write headers
    const baseHeaders = ['Customer Name', 'Location', 'Width', 'Height', 'Mount Type', 'Color Code', 'Mechanism', 'Blind Type', 'Notes'];
    const dynamicHeaders = [];
    if (quoteColumns) {
      quoteColumns.forEach(col => {
        dynamicHeaders.push(`${col.name} Type/Mech`);
        dynamicHeaders.push(`${col.name} Factory Cost`);
        dynamicHeaders.push(`${col.name} Upcharge`);
        dynamicHeaders.push(`${col.name} Final Price`);
      });
    }
    
    const allHeaders = [...baseHeaders, ...dynamicHeaders];

    // Prepare rows
    const rows = blinds.map(b => {
      const baseRow = [
        customerName, b.location, b.width, b.height, b.mountType, b.colorCode, b.mechanism, b.blindType, b.notes || ''
      ];
      
      const dynamicRow = [];
      if (quoteColumns) {
        quoteColumns.forEach(col => {
          const colData = b[col.id] || {};
          const typeMech = (col.blindType || b.blindType) + ' (' + (col.mechanism || b.mechanism) + ')';
          dynamicRow.push(typeMech);
          dynamicRow.push(`$${(colData.factoryCost || 0).toFixed(2)}`);
          dynamicRow.push(`$${(colData.upcharge || 0).toFixed(2)}`);
          dynamicRow.push(`$${(colData.finalPrice || 0).toFixed(2)}`);
        });
      }
      
      return [...baseRow, ...dynamicRow];
    });

    // Clear existing data completely
    await sheets.spreadsheets.values.clear({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A1:ZZ`,
    });

    // Write new data
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterSpreadsheetId,
      range: `'${customerName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [allHeaders, ...rows]
      }
    });

    return NextResponse.json({ success: true, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${masterSpreadsheetId}/edit#gid=${sheetId}` });

  } catch (error) {
    console.error('Error saving quote:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
