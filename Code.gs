// Code.gs - よいどころ千福 店舗チェックシステム v3 (Multi-Store Support)
// 読み取り系は GET、送信（submitChecks）は POST の JSON ボディ推奨（URL 長制限回避）

// ============================================================
// 定数
// ============================================================

const SHEET_ID = '1SvnkJzDm6AzcyGHuJOUprppQWnSUUEcJUtv5HMhAuAk';

const SHEETS = {
  STAFF:    'スタッフマスタ',
  ITEMS:    'チェック項目マスタ',
  HISTORY:  'チェック履歴',
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
      case 'getOmissions':
        result = getOmissions(storeId);
        break;
      case 'submitChecks':
        /* 互換用: 小さいペイロードのみ。通常は doPost（本文 JSON）を使用 */
        var payload = JSON.parse(e.parameter.data);
        result = submitChecks(payload);
        break;
      case 'debugData':
        var raw = e.parameter.data || '(empty)';
        var parsed2 = JSON.parse(e.parameter.data);
        var items2 = parsed2.items || [];
        var debugInfo = items2.map(function(it) {
          return { itemId: it.itemId, temperature: it.temperature, type: typeof it.temperature };
        });
        result = { raw_length: raw.length, items: debugInfo, first_100: raw.substring(0, 100) };
        break;
      case 'addStaff':
        result = addStaff(e.parameter.name);
        break;
      case 'toggleStaffStatus':
        result = toggleStaffStatus(e.parameter.staffId);
        break;
      case 'getHistory':
        result = getHistory(storeId, e.parameter.date || '');
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
      case 'contact':
        result = sendContactToNotion(body);
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
  // 列構造: A:storeId, B:category, C:timing, D:itemId, E:itemName, F:memo, G:active
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== storeId) continue;
    if (row[6] === false || row[6] === 'FALSE') continue;
    items.push({
      storeId: row[0], category: row[1], timing: row[2],
      itemId: row[3], name: row[4], sortOrder: i,
      memo: row[5] || '', minutes: '', priority: '', frequency: ''
    });
  }
  return items;
}

// ============================================================
// チェック履歴 (7カラム構成)
// A: チェック日時  B: 店舗ID  C: スタッフID  D: スタッフ名  E: カテゴリ  F: 項目ID  G: 温度
// ============================================================

function getBusinessDate_() {
  var now = new Date();
  var hour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'H'), 10);
  if (hour < RESET_HOUR) now.setDate(now.getDate() - 1);
  return Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/** チェック日時(Date or 文字列)から営業日(yyyy-MM-dd)を算出 */
function businessDateFromTimestamp_(ts) {
  var d;
  if (ts instanceof Date) {
    d = ts;
  } else {
    d = new Date(String(ts));
  }
  var hour = parseInt(Utilities.formatDate(d, 'Asia/Tokyo', 'H'), 10);
  if (hour < RESET_HOUR) d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function getTodayChecked(storeId, category) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.HISTORY);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var bd = getBusinessDate_();
  var ids = [];
  // 7列構造: チェック日時(0), 店舗ID(1), スタッフID(2), スタッフ名(3), カテゴリ(4), 項目ID(5), 温度(6)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var cd = businessDateFromTimestamp_(row[0]);
    if (cd === bd && row[1] === storeId && row[4] === category) {
      ids.push(row[5]);
    }
  }
  return ids;
}

// ============================================================
// 未実施チェック取得（前営業日分）
// ============================================================

function getOmissions(storeId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var omSheet = ss.getSheetByName(SHEETS.OMISSIONS);
  if (!omSheet || omSheet.getLastRow() <= 1) return [];

  // 直近の営業日の未実施を返す（最新の日付を探す）
  var data = omSheet.getDataRange().getValues();
  var latestDate = '';
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== storeId) continue;
    var rd = data[i][1] instanceof Date ? Utilities.formatDate(data[i][1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(data[i][1]).substring(0, 10);
    if (rd > latestDate) latestDate = rd;
  }
  if (!latestDate) return [];

  var omissions = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== storeId) continue;
    var rd = row[1] instanceof Date ? Utilities.formatDate(row[1], 'Asia/Tokyo', 'yyyy-MM-dd') : String(row[1]).substring(0, 10);
    if (rd === latestDate) {
      omissions.push({ category: row[2], itemId: row[3], name: row[4], date: latestDate });
    }
  }
  return omissions;
}

// ============================================================
// チェック結果送信 (7カラム構成)
// ============================================================

function submitChecks(payload) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.HISTORY);
  var now = new Date();
  var dt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var bd = getBusinessDate_();
  var storeId = payload.storeId || 'STORE001';
  var staffName = payload.staffName || '';
  var checked = payload.items.filter(function(i) { return i.checked; });

  // 重複チェック: 同じ営業日・店舗・カテゴリの既存itemIdを収集
  var existing = {};
  if (sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    for (var j = 1; j < data.length; j++) {
      var rowBd = businessDateFromTimestamp_(data[j][0]);
      if (rowBd === bd && data[j][1] === storeId && data[j][4] === payload.category) {
        existing[data[j][5]] = true;
      }
    }
  }

  var rows = [];
  for (var i = 0; i < checked.length; i++) {
    if (existing[checked[i].itemId]) continue;
    var temp = '';
    if (checked[i].temperature !== undefined && checked[i].temperature !== null) {
      temp = checked[i].temperature + '°C';
    }
    rows.push([dt, storeId, payload.staffId, staffName, payload.category, checked[i].itemId, temp]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  }
  return { status: 'success', count: rows.length };
}

// ============================================================
// チェック履歴取得（アプリ内ビュー用）
// ============================================================

function getHistory(storeId, dateStr) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var targetDate = dateStr || getBusinessDate_();

  // チェック項目マスタ → カテゴリ別の全項目数 & タイミング別項目数
  var itemSheet = ss.getSheetByName(SHEETS.ITEMS);
  var itemData = itemSheet.getDataRange().getValues();
  var categoryTotals = {};
  var itemTimingMap = {};
  var timingTotals = {};
  for (var i = 1; i < itemData.length; i++) {
    var row = itemData[i];
    if (row[0] !== storeId) continue;
    if (row[6] === false || row[6] === 'FALSE') continue;
    var cat = row[1];
    var timing = row[2] || '';
    if (!categoryTotals[cat]) categoryTotals[cat] = 0;
    categoryTotals[cat]++;
    itemTimingMap[row[3]] = timing;
    if (cat === '氷プール') {
      if (!timingTotals[timing]) timingTotals[timing] = 0;
      timingTotals[timing]++;
    }
  }

  // チェック履歴 → 対象日のデータを収集
  var histSheet = ss.getSheetByName(SHEETS.HISTORY);
  if (!histSheet || histSheet.getLastRow() <= 1) {
    var emptyCats = [];
    var catOrder0 = ['開店', '閉店', 'トイレ清掃', '氷プール'];
    for (var c0 in categoryTotals) { if (catOrder0.indexOf(c0) === -1) catOrder0.push(c0); }
    for (var e = 0; e < catOrder0.length; e++) {
      var cn0 = catOrder0[e];
      if (!categoryTotals[cn0]) continue;
      var entry = { name: cn0, type: 'standard', total: categoryTotals[cn0], checked: 0, staffName: null };
      if (cn0 === 'トイレ清掃') {
        entry.type = 'count';
        entry.itemsCovered = 0;
        entry.logCount = 0;
      }
      if (cn0 === '氷プール') { entry.type = 'timing'; entry.timings = []; }
      emptyCats.push(entry);
    }
    return { date: targetDate, categories: emptyCats };
  }

  var histData = histSheet.getDataRange().getValues();
  var catMap = {};

  for (var j = 1; j < histData.length; j++) {
    var h = histData[j];
    var bd = businessDateFromTimestamp_(h[0]);
    if (bd !== targetDate || h[1] !== storeId) continue;

    var category = h[4];
    if (!catMap[category]) catMap[category] = { staffNames: {}, count: 0, itemIds: {}, timingChecked: {} };

    var sName = h[3] || '';
    if (sName) catMap[category].staffNames[sName] = true;
    catMap[category].count++;

    var itemId = h[5];
    catMap[category].itemIds[itemId] = true;

    if (category === '氷プール') {
      var t = itemTimingMap[itemId] || '';
      if (t) {
        if (!catMap[category].timingChecked[t]) catMap[category].timingChecked[t] = 0;
        catMap[category].timingChecked[t]++;
      }
    }
  }

  var categories = [];
  var catOrder = ['開店', '閉店', 'トイレ清掃', '氷プール'];
  for (var c in categoryTotals) {
    if (catOrder.indexOf(c) === -1) catOrder.push(c);
  }

  for (var k = 0; k < catOrder.length; k++) {
    var cn = catOrder[k];
    if (!categoryTotals[cn]) continue;
    var info = catMap[cn] || { staffNames: {}, count: 0, itemIds: {}, timingChecked: {} };
    var staffArr = Object.keys(info.staffNames);

    if (cn === 'トイレ清掃') {
      var toiletUnique = Object.keys(info.itemIds).length;
      categories.push({
        name: cn,
        type: 'count',
        total: categoryTotals[cn],
        itemsCovered: toiletUnique,
        logCount: info.count,
        staffName: staffArr.length > 0 ? staffArr.join(', ') : null
      });
    } else if (cn === '氷プール') {
      var timingOrder = ['出勤時', '22時', '退勤時'];
      var timings = [];
      for (var ti = 0; ti < timingOrder.length; ti++) {
        var tn = timingOrder[ti];
        var total = timingTotals[tn] || 0;
        if (total === 0) continue;
        var done = info.timingChecked[tn] || 0;
        timings.push({ name: tn, total: total, checked: done });
      }
      categories.push({
        name: cn,
        type: 'timing',
        total: categoryTotals[cn],
        checked: Object.keys(info.itemIds).length,
        staffName: staffArr.length > 0 ? staffArr.join(', ') : null,
        timings: timings
      });
    } else {
      categories.push({
        name: cn,
        type: 'standard',
        total: categoryTotals[cn],
        checked: Object.keys(info.itemIds).length,
        staffName: staffArr.length > 0 ? staffArr.join(', ') : null
      });
    }
  }

  return { date: targetDate, categories: categories };
}

// ============================================================
// スプレッドシート初期化（ヘッダー作成用）
// ============================================================

function setupSpreadsheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // 未実施チェックシート
  var omSheet = ss.getSheetByName(SHEETS.OMISSIONS) || ss.insertSheet(SHEETS.OMISSIONS);
  if (omSheet.getLastRow() === 0) {
    omSheet.appendRow(['storeId', 'date', 'category', 'itemId', 'itemName']);
  }

  Logger.log('Spreadsheet setup complete.');
}

function checkOmissions() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var bd = getBusinessDate_();
  var items = ss.getSheetByName(SHEETS.ITEMS).getDataRange().getValues();
  var hist = ss.getSheetByName(SHEETS.HISTORY).getDataRange().getValues();

  // その営業日にチェック履歴があるカテゴリを収集
  // 7列構造: チェック日時(0), 店舗ID(1), スタッフID(2), スタッフ名(3), カテゴリ(4), 項目ID(5), 温度(6)
  var activeCategories = {};
  for (var h = 1; h < hist.length; h++) {
    var hd = businessDateFromTimestamp_(hist[h][0]);
    if (hd === bd) activeCategories[hist[h][4]] = true;
  }
  if (Object.keys(activeCategories).length === 0) {
    Logger.log('営業日 ' + bd + ' のチェック履歴なし（完全定休日）。スキップ');
    return { status: 'skipped', reason: '定休日（チェック履歴なし）' };
  }
  var omSheet = ss.getSheetByName(SHEETS.OMISSIONS) || ss.insertSheet(SHEETS.OMISSIONS);
  if (omSheet.getLastRow() === 0) omSheet.appendRow(['storeId', 'date', 'category', 'itemId', 'itemName']);
  
  var stores = ['STORE001'];
  
  var omissions = [];
  
  stores.forEach(function(storeId) {
    // 1. その店舗の全項目
    var masterItems = items.filter(function(row, i) { 
      return i > 0 && row[0] === storeId && (row[6] === true || row[6] === 'TRUE'); 
    });
    
    // 2. その店舗・その日の実施済み
    var doneIds = {};
    for (var j = 1; j < hist.length; j++) {
      var cd = businessDateFromTimestamp_(hist[j][0]);
      if (cd === bd && hist[j][1] === storeId) {
        doneIds[hist[j][5]] = true;
      }
    }
    
    // 3. マスタにはあるが未実施のものを抽出（その日にチェック履歴があるカテゴリのみ）
    masterItems.forEach(function(m) {
      if (!activeCategories[m[1]]) return; // このカテゴリは今日使われていない
      if (!doneIds[m[3]]) {
        omissions.push([storeId, bd, m[1], m[3], m[4]]);
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
    omSheet.getRange(omSheet.getLastRow() + 1, 1, omissions.length, 5).setValues(omissions);
  }
  
  return { status: 'success', count: omissions.length };
}

// ============================================================
// 問い合わせ → Notion 送信
// ============================================================

function getNotionToken_() {
  return PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
}
function getNotionDbId_() {
  return PropertiesService.getScriptProperties().getProperty('NOTION_DB_ID');
}

function sendContactToNotion(body) {
  var now = new Date();
  var isoDate = Utilities.formatDate(now, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");

  var properties = {
    '名前': { title: [{ text: { content: body.name || '(未入力)' } }] },
    'カテゴリ': { select: { name: body.category || 'その他' } },
    '企業名': { rich_text: [{ text: { content: body.company || '' } }] },
    '問い合わせ内容': { rich_text: [{ text: { content: body.message || '' } }] },
    '日時': { date: { start: isoDate } },
    'ステータス': { select: { name: '未対応' } }
  };

  if (body.email) {
    properties['メールアドレス'] = { email: body.email };
  }

  var payload = {
    parent: { database_id: getNotionDbId_() },
    properties: properties
  };

  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + getNotionToken_(),
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
  var code = res.getResponseCode();

  if (code === 200) {
    return { status: 'success' };
  } else {
    Logger.log('Notion API error: ' + res.getContentText());
    throw new Error('Notion への送信に失敗しました (HTTP ' + code + ')');
  }
}

// ============================================================
// Google ドキュメント → チェック項目マスタ 同期
// GAS エディタから手動実行する。トイレ清掃の行は触らない。
// ============================================================

var SYNC_DOCS = {
  '開店': '1ZYw9Kv0LYOMOAqxyXZ6gPB4FsJjLVIV9Gg1aepJYleI',
  '閉店': '1DP9mepRb_7M_5uNSszgzOR8Phz4AJZbkaCakLLvmCWk'
};

function syncCheckItemsFromDocs() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.ITEMS);
  var storeId = 'STORE001';

  var kaitenItems = parseKaitenDoc_(SYNC_DOCS['開店']);
  var heitenItems = parseHeitenDoc_(SYNC_DOCS['閉店']);

  deleteRowsByCategory_(sheet, storeId, '開店');
  deleteRowsByCategory_(sheet, storeId, '閉店');

  var rows = [];
  kaitenItems.forEach(function (item, i) {
    rows.push([storeId, '開店', item.timing, 'KAI' + ('000' + (i + 1)).slice(-3), item.name, item.memo, true]);
  });
  heitenItems.forEach(function (item, i) {
    rows.push([storeId, '閉店', item.timing, 'HEI' + ('000' + (i + 1)).slice(-3), item.name, item.memo, true]);
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  }

  Logger.log('同期完了: 開店 ' + kaitenItems.length + '件, 閉店 ' + heitenItems.length + '件');
  return { kaiten: kaitenItems.length, heiten: heitenItems.length };
}

function deleteRowsByCategory_(sheet, storeId, category) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === storeId && data[i][1] === category) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ---- 開店マニュアル解析 ----
function parseKaitenDoc_(docId) {
  var doc = DocumentApp.openById(docId);
  var text = doc.getBody().getText();
  var lines = text.split('\n');
  var items = [];
  var timing = '出勤時';
  var skipPatterns = /^(日付|開店作業マニュアル|／|月|火|水|木|金|土|☐|担当者|サイン|１８：００|$)/;
  var timingMap = {
    '出勤': '出勤時',
    '1７：３０': '17:30〜',
    '17：30': '17:30〜',
    '17:30': '17:30〜',
    '１７：５０': '17:50〜',
    '17：50': '17:50〜',
    '17:50': '17:50〜',
    '１７：５５': '17:50〜',
    '17：55': '17:50〜',
    '17:55': '17:50〜'
  };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (skipPatterns.test(line)) continue;

    var foundTiming = false;
    for (var key in timingMap) {
      if (line.indexOf(key) === 0) {
        timing = timingMap[key];
        foundTiming = true;
        break;
      }
    }
    if (foundTiming) continue;

    var name = line;
    var memo = '';
    var parenMatch = name.match(/[（(]([^）)]+)[）)]/);
    if (parenMatch) {
      memo = parenMatch[1];
    }

    items.push({ timing: timing, name: name, memo: memo });
  }

  return items;
}

// ============================================================
// 氷プール項目をチェック項目マスタに追加（初回のみ実行）
// ============================================================

function addIcePoolItems() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.ITEMS);
  var storeId = 'STORE001';

  // 既存の氷プール項目があれば削除して再作成
  deleteRowsByCategory_(sheet, storeId, '氷プール');

  var timings = ['出勤時', '22時', '退勤時'];
  var tasks = ['氷補充', '塩補充', '温度計測'];
  var rows = [];
  var num = 1;

  timings.forEach(function (timing) {
    tasks.forEach(function (task) {
      var itemId = 'ICE' + ('000' + num).slice(-3);
      rows.push([storeId, '氷プール', timing, itemId, task, '', true]);
      num++;
    });
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  }

  Logger.log('氷プール項目追加完了: ' + rows.length + '件');
  return { status: 'success', count: rows.length };
}

// ---- 閉店マニュアル解析 ----
function parseHeitenDoc_(docId) {
  var doc = DocumentApp.openById(docId);
  var text = doc.getBody().getText();
  var lines = text.split('\n');
  var items = [];
  var skipPatterns = /^(閉店作業マニュアル|日付|／|項⽬|やり⽅|月|火|水|木|金|土|☐|担当者|サイン|【最終項⽬】|$)/;

  var pendingName = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (skipPatterns.test(line)) continue;

    if (!pendingName) {
      pendingName = line;
    } else {
      var memo = line;
      items.push({ timing: '閉店後', name: pendingName, memo: memo });
      pendingName = '';
    }
  }
  if (pendingName) {
    items.push({ timing: '閉店後', name: pendingName, memo: '' });
  }

  return items;
}

