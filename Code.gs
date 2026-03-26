// Code.gs - よいどころ千福 店舗チェックシステム v3 (Multi-Store Support)
// 読み取り系は GET、送信（submitChecks）は POST の JSON ボディ推奨（URL 長制限回避）

// ============================================================
// 定数
// ============================================================

const SHEET_ID = '1SvnkJzDm6AzcyGHuJOUprppQWnSUUEcJUtv5HMhAuAk';

const SHEETS = {
  STORES:   '店舗マスタ',
  STAFF:    'スタッフマスタ',
  ITEMS:    'チェック項目マスタ',
  HISTORY:  'チェック履歴',
  AGGREGATION: '集計',
  OMISSIONS: '未実施チェック'
};

const RESET_HOUR = 7;
/** スクリプトプロパティ API_KEY 未設定時のフォールバック（プロパティに移行推奨） */
const API_KEY = 'senpuku-secret-key-2024';

/** プロパティ未設定・空・空白のみはコード内の API_KEY にフォールバック。値は trim して比較 */
function getApiKey_() {
  var raw = PropertiesService.getScriptProperties().getProperty('API_KEY');
  var t = raw == null ? '' : String(raw).trim();
  return t.length ? t : API_KEY;
}

function assertApiKey_(apiKey) {
  var expected = getApiKey_();
  var got = apiKey == null ? '' : String(apiKey).trim();
  if (got !== expected) {
    throw new Error('Invalid API Key: 認証に失敗しました。');
  }
}

// ============================================================
// Web App エントリーポイント
// ============================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  var storeId = (e && e.parameter && e.parameter.storeId) || 'STORE001'; // デフォルト値
  var apiKey = (e && e.parameter && e.parameter.apiKey) || '';
  var result;

  try {
    assertApiKey_(apiKey);

    switch(action) {
      case 'getStaffList':
        result = getStaffList();
        break;
      case 'getCheckItems':
        result = getCheckItems(storeId);
        break;
      case 'getTodayChecked':
        result = getTodayChecked(storeId, e.parameter.category || '');
        break;
      case 'submitChecks':
        var payload = JSON.parse(e.parameter.data);
        result = submitChecks(payload);
        break;
      case 'addStaff':
        result = addStaff(e.parameter.name);
        break;
      case 'toggleStaffStatus':
        result = toggleStaffStatus(e.parameter.staffId);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * submitChecks 専用: JSON ボディ { action, apiKey, data: payload }
 * Content-Type: text/plain で送るとブラウザのプリフライトを避けやすい
 */
function doPost(e) {
  var result;
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || '';
    assertApiKey_(body.apiKey || '');

    switch (action) {
      case 'submitChecks':
        result = submitChecks(body.data);
        break;
      default:
        result = { error: 'POST は submitChecks のみ対応しています' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// スタッフ管理
// ============================================================

function getStaffList() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.STAFF);
  var data = sheet.getDataRange().getValues();
  var staff = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    staff.push({ id: row[0], name: row[1], active: row[2] === true || row[2] === 'TRUE' });
  }
  return staff;
}

function addStaff(name) {
  var trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('名前を入力してください。');
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.STAFF);
  var data = sheet.getDataRange().getValues();
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    var match = String(data[i][0]).match(/STAFF(\d+)/);
    if (match) { var n = parseInt(match[1], 10); if (n > maxNum) maxNum = n; }
  }
  var newId = 'STAFF' + ('000' + (maxNum + 1)).slice(-3);
  sheet.appendRow([newId, trimmed, true]);
  return { id: newId, name: trimmed, active: true };
}

function toggleStaffStatus(staffId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.STAFF);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === staffId) {
      var cur = data[i][2] === true || data[i][2] === 'TRUE';
      sheet.getRange(i + 1, 3).setValue(!cur);
      return { id: staffId, active: !cur };
    }
  }
  throw new Error('スタッフが見つかりません: ' + staffId);
}

// ============================================================
// チェック項目 (storeId 対応)
// ============================================================

function getCheckItems(storeId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.ITEMS);
  var data = sheet.getDataRange().getValues();
  var items = [];
  // 新構造: storeId, category, timing, itemId, itemName, displayOrder, active
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== storeId) continue;
    if (row[6] === false || row[6] === 'FALSE') continue; // 非アクティブをスキップ
    items.push({
      storeId: row[0], category: row[1], timing: row[2], 
      itemId: row[3], name: row[4], sortOrder: row[5],
      memo: row[7] || '', minutes: '', priority: '', frequency: '' // memoをスプレッドシート(H列)から取得
    });
  }
  items.sort(function(a, b) { return (a.sortOrder || 999) - (b.sortOrder || 999); });
  return items;
}

// ============================================================
// チェック履歴 (storeId 対応 & 8カラム構成)
// ============================================================

function getBusinessDate_() {
  var now = new Date();
  var hour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'H'), 10);
  if (hour < RESET_HOUR) now.setDate(now.getDate() - 1);
  return Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function getTodayChecked(storeId, category) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.HISTORY);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var bd = getBusinessDate_();
  var ids = [];
  // 新構造: timestamp, date, storeId, staffId, category, itemId, checked, comment
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var cd = row[1] instanceof Date ? Utilities.formatDate(row[1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(row[1]).substring(0, 10);
    if (cd === bd && row[2] === storeId && row[4] === category && (row[6] === true || row[6] === 'TRUE')) {
      ids.push(row[5]); // itemId
    }
  }
  return ids;
}

// ============================================================
// チェック結果送信 (8カラム構成)
// ============================================================

function submitChecks(payload) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.HISTORY);
  var now = new Date();
  var dt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var bd = getBusinessDate_();
  var storeId = payload.storeId || 'STORE001';
  var checked = payload.items.filter(function(i) { return i.checked; });
  var rows = [];
  
  // 新構成: timestamp, date, storeId, staffId, category, itemId, checked, comment
  for (var i = 0; i < checked.length; i++) {
    rows.push([dt, bd, storeId, payload.staffId, payload.category, checked[i].itemId, true, '']);
  }
  
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  }
  return { status: 'success', count: rows.length };
}

// ============================================================
// スプレッドシート初期化（ヘッダー作成用）
// ============================================================

function setupSpreadsheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  
  // 店舗マスタ
  var storeSheet = ss.getSheetByName(SHEETS.STORES) || ss.insertSheet(SHEETS.STORES);
  if (storeSheet.getLastRow() === 0) {
    storeSheet.appendRow(['storeId', 'storeName', 'active']);
    storeSheet.appendRow(['STORE001', 'よいどころ千福', true]);
  }
  
  // 集計シート
  var aggSheet = ss.getSheetByName(SHEETS.AGGREGATION) || ss.insertSheet(SHEETS.AGGREGATION);
  if (aggSheet.getLastRow() === 0) {
    aggSheet.getRange('A1').setFormula('=QUERY(\'チェック履歴\'!A:H, "select C,B,count(F),sum(G) label count(F) \'全項目数\', sum(G) \'完了数\' group by C,B", 1)');
  }
  
  // 未実施チェックシート
  var omSheet = ss.getSheetByName(SHEETS.OMISSIONS) || ss.insertSheet(SHEETS.OMISSIONS);
  if (omSheet.getLastRow() === 0) {
    omSheet.appendRow(['storeId', 'date', 'itemId', 'itemName']);
  }
  
  Logger.log('Spreadsheet setup complete.');
}

function checkOmissions() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var bd = getBusinessDate_();
  var items = ss.getSheetByName(SHEETS.ITEMS).getDataRange().getValues();
  var hist = ss.getSheetByName(SHEETS.HISTORY).getDataRange().getValues();
  var omSheet = ss.getSheetByName(SHEETS.OMISSIONS) || ss.insertSheet(SHEETS.OMISSIONS);
  if (omSheet.getLastRow() === 0) omSheet.appendRow(['storeId', 'date', 'itemId', 'itemName']);
  
  // 定義されている店舗リスト（storeId）を取得
  var stores = [];
  var masterStores = ss.getSheetByName(SHEETS.STORES).getDataRange().getValues();
  for (var s = 1; s < masterStores.length; s++) { if (masterStores[s][0] && masterStores[s][2]) stores.push(masterStores[s][0]); }
  
  var omissions = [];
  
  stores.forEach(function(storeId) {
    // 1. その店舗の全項目
    var masterItems = items.filter(function(row, i) { 
      return i > 0 && row[0] === storeId && (row[6] === true || row[6] === 'TRUE'); 
    });
    
    // 2. その店舗・その日の実施済み
    var doneIds = {};
    for (var j = 1; j < hist.length; j++) {
      var cd = hist[j][1] instanceof Date ? Utilities.formatDate(hist[j][1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(hist[j][1]).substring(0, 10);
      if (cd === bd && hist[j][2] === storeId && (hist[j][6] === true || hist[j][6] === 'TRUE')) {
        doneIds[hist[j][5]] = true;
      }
    }
    
    // 3. マスタにはあるが未実施のものを抽出
    masterItems.forEach(function(m) {
      if (!doneIds[m[3]]) {
        omissions.push([storeId, bd, m[3], m[4]]);
      }
    });
  });
  
  // 4. 重複を避けて書き込み（その日の既存データを消してから書き直す）
  var oldData = omSheet.getDataRange().getValues();
  for (var k = oldData.length - 1; k >= 1; k--) {
    var od = oldData[k][1] instanceof Date ? Utilities.formatDate(oldData[k][1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(oldData[k][1]).substring(0, 10);
    if (od === bd) omSheet.deleteRow(k + 1);
  }
  
  if (omissions.length > 0) {
    omSheet.getRange(omSheet.getLastRow() + 1, 1, omissions.length, 4).setValues(omissions);
  }
  
  return { status: 'success', count: omissions.length };
}

