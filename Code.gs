// Google Apps Script - Code.gs
// Deploy as Web App: Execute as Me, Access: Anyone

const SPREADSHEET_ID = '1-VpvKLnkqpkpVPz5xPAUUzxRFG5dfOZBjhbSLrrqwSQ';
const SHEET_NAME = 'Sheet1';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['시간','고객명','예약번호','연락처','이메일','카드번호','만료일','카드사','카드종류','언어','서명']);
    }
    sheet.appendRow([
      new Date().toISOString(),
      data.renterName || '',
      data.reservationNo || '',
      data.contactNo || '',
      data.email || '',
      data.cardNumber || '',
      data.expirationDate || '',
      data.cardIssuer || '',
      data.cardType || '',
      data.lang || '',
      data.signature || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    
    const headers = data[0];
    const rows = data.slice(1).reverse().map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i] || '');
      return {
        timestamp: obj['시간'] || '',
        renterName: obj['고객명'] || '',
        reservationNo: obj['예약번호'] || '',
        contactNo: obj['연락처'] || '',
        email: obj['이메일'] || '',
        cardNumber: obj['카드번호'] || '',
        expirationDate: obj['만료일'] || '',
        cardIssuer: obj['카드사'] || '',
        cardType: obj['카드종류'] || '',
        lang: obj['언어'] || '',
        signature: obj['서명'] || ''
      };
    });
    return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
