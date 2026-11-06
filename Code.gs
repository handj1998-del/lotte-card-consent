/**
 * 롯데렌터카 김해공항 카드 동의서 Apps Script (개선 버전)
 * Spreadsheet ID: 1-VpvKLnkqpkpVPz5xPAUUzxRFG5dfOZBjhbSLrrqwSQ
 */
const SPREADSHEET_ID = "1-VpvKLnkqpkpVPz5xPAUUzxRFG5dfOZBjhbSLrrqwSQ";
const SHEET_NAME = "동의서";

function doPost(e) {
  try {
    const sheet = getSheet();
    const data = JSON.parse(e.postData.contents);
    
    const row = [
      new Date(),
      data.renterName || "",
      data.reservationNo || "",
      data.contactNo || "",
      data.email || "",
      data.cardNumber || "",
      data.expirationDate || "",
      data.cardIssuer || "",
      data.cardType || "",
      data.signature || ""
    ];
    
    sheet.appendRow(row);
    
    return ContentService
      .createTextOutput(JSON.stringify({ result: "success", message: "저장 완료" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err);
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ result: "success", data: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const numRows = lastRow - 1;
    const values = sheet.getRange(2, 1, numRows, 10).getValues();
    
    const data = values.map(row => ({
      timestamp: row[0],
      renterName: row[1],
      reservationNo: row[2],
      contactNo: row[3],
      email: row[4],
      cardNumber: row[5],
      expirationDate: row[6],
      cardIssuer: row[7],
      cardType: row[8],
      signature: row[9]
    })).reverse();
    
    return ContentService
      .createTextOutput(JSON.stringify({ result: "success", data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err);
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ["시간", "고객명", "예약번호", "연락처", "이메일", "카드번호", "만료일", "카드사", "카드종류", "서명"];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
    sheet.autoResizeColumns(1, headers.length);
  }
  
  return sheet;
}

// 테스트용 함수 (옵션)
function testConnection() {
  const sheet = getSheet();
  Logger.log("시트 연결 성공: " + sheet.getName() + " / 행 수: " + sheet.getLastRow());
}
