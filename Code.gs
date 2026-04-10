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
  OMISSIONS: '未実施チェック',
  CONFIRMATIONS: '確認履歴',
  PHOTO_JUDGMENTS: '写真判定履歴'
};

// 営業時間: 18:00-29:00（翌朝5:00）。チェックタイムは 33:00（翌朝9:00）まで当日扱い。
const RESET_HOUR = 9;
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
      case 'getKaitenConfirmationStatus':
        result = getKaitenConfirmationStatus(storeId);
        break;
      case 'getConfirmationStatus':
        result = getConfirmationStatus(storeId, e.parameter.category || '開店');
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

    // LINE Webhook イベント処理
    if (body.events) {
      handleLineWebhook_(body.events);
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    var action = body.action || '';
    assertApiKey_(body.apiKey || '');

    switch (action) {
      case 'submitChecks':
        var pdata = body.data;
        if (typeof pdata === 'string') {
          try {
            pdata = JSON.parse(pdata);
          } catch (e2) {
            throw new Error('data の JSON が不正です');
          }
        }
        result = submitChecks(pdata);
        break;
      case 'contact':
        result = sendContactToNotion(body);
        break;
      case 'submitConfirmation':
        var pcdata = body.data;
        if (typeof pcdata === 'string') {
          try {
            pcdata = JSON.parse(pcdata);
          } catch (e3) {
            throw new Error('data の JSON が不正です');
          }
        }
        result = submitConfirmation(pcdata);
        break;
      case 'submitPhotoCheck':
        var ppdata = body.data;
        if (typeof ppdata === 'string') {
          try {
            ppdata = JSON.parse(ppdata);
          } catch (e4) {
            throw new Error('data の JSON が不正です');
          }
        }
        result = submitPhotoCheck(ppdata);
        break;
      case 'submitTemperaturePhoto':
        var ptdata = body.data;
        if (typeof ptdata === 'string') {
          try {
            ptdata = JSON.parse(ptdata);
          } catch (e5) {
            throw new Error('data の JSON が不正です');
          }
        }
        result = submitTemperaturePhoto(ptdata);
        break;
      default:
        result = { error: 'Unknown POST action: ' + action };
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
  // 列構造: A:storeId, B:category, C:timing, D:itemId, E:itemName, F:memo, G:active, H:photoRequired
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== storeId) continue;
    if (row[6] === false || row[6] === 'FALSE') continue;
    var photoReq = row[7] === true || row[7] === 'TRUE';
    items.push({
      storeId: row[0], category: row[1], timing: row[2],
      itemId: row[3], name: row[4], sortOrder: i,
      memo: row[5] || '', minutes: '', priority: '', frequency: '',
      photoRequired: photoReq
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

/**
 * チェック履歴シートの1行を正規化（店舗・カテゴリ・項目IDの列位置を統一）
 * 新形式（ヘッダー準拠）: 日時 | 店舗ID | スタッフID | スタッフ名 | カテゴリ | 項目ID | 温度
 * 旧誤形式: 日時 | 営業日 | 店舗ID | スタッフID | カテゴリ | 項目ID | TRUE … のように B が日付・G が TRUE の行
 */
function normalizeHistoryRow_(row) {
  var r1 = row[1];
  var r1s = '';
  if (r1 instanceof Date) {
    r1s = Utilities.formatDate(r1, 'Asia/Tokyo', 'yyyy-MM-dd');
  } else {
    r1s = String(r1).trim();
  }
  var r2 = String(row[2] || '');
  var legacy = /^\d{4}-\d{2}-\d{2}$/.test(r1s) && /^STORE/.test(r2);
  if (legacy) {
    return {
      legacy: true,
      storeId: row[2],
      staffId: row[3],
      staffName: '',
      staffDisplay: row[3] ? String(row[3]) : '',
      category: row[4],
      itemId: row[5],
      temp: (row[6] === true || row[6] === 'TRUE') ? '' : String(row[6] || '')
    };
  }
  return {
    legacy: false,
    storeId: row[1],
    staffId: row[2],
    staffName: row[3] ? String(row[3]) : '',
    staffDisplay: row[3] ? String(row[3]) : '',
    category: row[4],
    itemId: row[5],
    temp: (row[6] === true || row[6] === 'TRUE') ? '' : String(row[6] || '')
  };
}

function getTodayChecked(storeId, category) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.HISTORY);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var bd = getBusinessDate_();
  var ids = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var cd = businessDateFromTimestamp_(row[0]);
    var nr = normalizeHistoryRow_(row);
    if (cd === bd && nr.storeId === storeId && nr.category === category) {
      ids.push(nr.itemId);
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
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      throw new Error('送信データの形式が不正です');
    }
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.HISTORY);
  var now = new Date();
  var dt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var bd = getBusinessDate_();
  var storeId = payload.storeId || 'STORE001';
  var staffName = payload.staffName || '';
  var checked = payload.items.filter(function(i) { return i.checked; });

  // 重複チェック: 同じ営業日・店舗・カテゴリの既存itemId（新形式・旧B列=営業日の行の両方）
  var existing = {};
  if (sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    for (var j = 1; j < data.length; j++) {
      var rowBd = businessDateFromTimestamp_(data[j][0]);
      var nr = normalizeHistoryRow_(data[j]);
      if (rowBd === bd && nr.storeId === storeId && nr.category === payload.category) {
        existing[nr.itemId] = true;
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
    // 必ず7列・営業日列は入れない（B=店舗ID）
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
    var nr = normalizeHistoryRow_(h);
    if (bd !== targetDate || nr.storeId !== storeId) continue;

    var category = nr.category;
    if (!catMap[category]) catMap[category] = { staffNames: {}, count: 0, itemIds: {}, timingChecked: {} };

    var sName = nr.staffName || nr.staffDisplay || '';
    if (sName) catMap[category].staffNames[sName] = true;
    catMap[category].count++;

    var itemId = nr.itemId;
    catMap[category].itemIds[itemId] = true;

    if (category === 'トイレ清掃') {
      var ts = h[0];
      var d = (ts instanceof Date) ? ts : new Date(String(ts));
      var hh = parseInt(Utilities.formatDate(d, 'Asia/Tokyo', 'H'), 10);
      var mm = Utilities.formatDate(d, 'Asia/Tokyo', 'mm');
      if (!catMap[category].hourlyLogs) catMap[category].hourlyLogs = [];
      catMap[category].hourlyLogs.push({
        hour: hh,
        time: Utilities.formatDate(d, 'Asia/Tokyo', 'HH:mm'),
        staffName: sName
      });
    }

    if (category === '氷プール') {
      var t = itemTimingMap[itemId] || '';
      if (t) {
        if (!catMap[category].timingChecked[t]) catMap[category].timingChecked[t] = 0;
        catMap[category].timingChecked[t]++;
        if (!catMap[category].timingStaff) catMap[category].timingStaff = {};
        if (sName) catMap[category].timingStaff[t] = sName;
        // 温度データを収集
        var tempVal = nr.temp || '';
        if (tempVal && tempVal !== '0' && tempVal.indexOf('°C') !== -1 || (!isNaN(parseFloat(tempVal)) && parseFloat(tempVal) !== 0)) {
          if (!catMap[category].timingTemp) catMap[category].timingTemp = {};
          catMap[category].timingTemp[t] = tempVal.replace('°C', '') + '°C';
        }
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
      var hourlyLogs = info.hourlyLogs || [];

      // Build hourly slots: 18-23, then 0-4
      var slotOrder = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4];
      var hourlySlots = [];
      for (var si = 0; si < slotOrder.length; si++) {
        var slotHour = slotOrder[si];
        var logsInHour = hourlyLogs.filter(function(l) { return l.hour === slotHour; });
        var label = (slotHour < 10 ? '0' : '') + slotHour + ':00';
        hourlySlots.push({
          hour: slotHour,
          label: label,
          done: logsInHour.length > 0,
          count: logsInHour.length,
          times: logsInHour.map(function(l) { return l.time; }),
          staff: logsInHour.length > 0 ? logsInHour[0].staffName : ''
        });
      }

      categories.push({
        name: cn,
        type: 'count',
        total: categoryTotals[cn],
        itemsCovered: toiletUnique,
        logCount: info.count,
        staffName: staffArr.length > 0 ? staffArr.join(', ') : null,
        hourlySlots: hourlySlots
      });
    } else if (cn === '氷プール') {
      var timingOrder = ['出勤時', '22時', '退勤時'];
      var timings = [];
      for (var ti = 0; ti < timingOrder.length; ti++) {
        var tn = timingOrder[ti];
        var total = timingTotals[tn] || 0;
        if (total === 0) continue;
        var done = info.timingChecked[tn] || 0;
        var tStaff = (info.timingStaff && info.timingStaff[tn]) ? info.timingStaff[tn] : '';
        var tTemp = (info.timingTemp && info.timingTemp[tn]) ? info.timingTemp[tn] : '';
        timings.push({ name: tn, total: total, checked: done, staff: tStaff, temperature: tTemp });
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

  // 確認履歴から開店チェックの確認者を取得
  var confSheet = ss.getSheetByName(SHEETS.CONFIRMATIONS);
  var confirmerNames = {};
  if (confSheet && confSheet.getLastRow() > 1) {
    var confData = confSheet.getDataRange().getValues();
    for (var ci = 1; ci < confData.length; ci++) {
      var cr = confData[ci];
      var confDate = businessDateFromTimestamp_(cr[0]);
      if (confDate !== targetDate) continue;
      if (String(cr[1]) !== storeId) continue;
      var confCat = cr[4] || '';
      var confName = cr[3] || '';
      if (confName) confirmerNames[confCat] = confName;
    }
  }
  // カテゴリにconfirmerNameを付与
  for (var ci2 = 0; ci2 < categories.length; ci2++) {
    if (confirmerNames[categories[ci2].name]) {
      categories[ci2].confirmerName = confirmerNames[categories[ci2].name];
    }
  }

  return { date: targetDate, categories: categories };
}

// ============================================================
// チェック確認ステータス取得（開店・閉店共通）
// ============================================================

function getConfirmationStatus(storeId, category) {
  category = category || '開店';
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var bd = getBusinessDate_();

  // 1. 対象カテゴリの有効項目をマスタから取得
  var itemSheet = ss.getSheetByName(SHEETS.ITEMS);
  var itemData = itemSheet.getDataRange().getValues();
  var targetItems = [];
  for (var i = 1; i < itemData.length; i++) {
    var row = itemData[i];
    if (row[0] !== storeId) continue;
    if (row[1] !== category) continue;
    if (row[6] === false || row[6] === 'FALSE') continue;
    targetItems.push({ itemId: row[3], name: row[4], memo: row[5] || '' });
  }

  // 2. 当日のチェック履歴を取得
  var histSheet = ss.getSheetByName(SHEETS.HISTORY);
  var checkedMap = {};
  if (histSheet && histSheet.getLastRow() > 1) {
    var histData = histSheet.getDataRange().getValues();
    for (var j = 1; j < histData.length; j++) {
      var hRow = histData[j];
      var hBd = businessDateFromTimestamp_(hRow[0]);
      var nr = normalizeHistoryRow_(hRow);
      if (hBd === bd && nr.storeId === storeId && nr.category === category) {
        checkedMap[nr.itemId] = { staffName: nr.staffName || nr.staffDisplay || '' };
      }
    }
  }

  // 3. 当日の確認履歴を取得
  var confSheet = ss.getSheetByName(SHEETS.CONFIRMATIONS);
  var confirmedMap = {};
  if (confSheet && confSheet.getLastRow() > 1) {
    var confData = confSheet.getDataRange().getValues();
    for (var k = 1; k < confData.length; k++) {
      var cRow = confData[k];
      var cBd = businessDateFromTimestamp_(cRow[0]);
      if (cBd === bd && cRow[1] === storeId && cRow[4] === category) {
        confirmedMap[cRow[5]] = {
          confirmerName: cRow[3] || '',
          confirmedAt: cRow[0] instanceof Date
            ? Utilities.formatDate(cRow[0], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
            : String(cRow[0]),
          status: cRow[6] || 'confirmed'
        };
      }
    }
  }

  // 4. 各項目の状態をまとめて返す
  var items = [];
  for (var m = 0; m < targetItems.length; m++) {
    var it = targetItems[m];
    var chk = checkedMap[it.itemId];
    var cnf = confirmedMap[it.itemId];
    items.push({
      itemId: it.itemId,
      name: it.name,
      memo: it.memo,
      checked: !!chk,
      checkerName: chk ? chk.staffName : '',
      confirmed: !!cnf,
      confirmerName: cnf ? cnf.confirmerName : '',
      confirmedAt: cnf ? cnf.confirmedAt : ''
    });
  }

  return { date: bd, items: items };
}

// 後方互換: 既存トリガー等から呼ばれる場合
function getKaitenConfirmationStatus(storeId) {
  return getConfirmationStatus(storeId, '開店');
}

// ============================================================
// チェック確認送信（開店・閉店共通）
// ============================================================

function submitConfirmation(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var bd = getBusinessDate_();
  var storeId = data.storeId || 'STORE001';
  var staffId = data.staffId || '';
  var staffName = data.staffName || '';
  var itemId = data.itemId || '';
  var category = data.category || '開店';
  var status = data.status || 'confirmed';

  // 確認履歴シートを取得または作成
  var confSheet = ss.getSheetByName(SHEETS.CONFIRMATIONS);
  if (!confSheet) {
    confSheet = ss.insertSheet(SHEETS.CONFIRMATIONS);
    confSheet.appendRow(['確認日時', '店舗ID', '確認者ID', '確認者名', 'カテゴリ', '項目ID', 'ステータス', 'チェック者名']);
  }

  // 重複チェック: 同営業日 + 同店舗 + 同項目 + 同確認者
  if (confSheet.getLastRow() > 1) {
    var confData = confSheet.getDataRange().getValues();
    for (var i = 1; i < confData.length; i++) {
      var cRow = confData[i];
      var cBd = businessDateFromTimestamp_(cRow[0]);
      if (cBd === bd && cRow[1] === storeId && cRow[5] === itemId && cRow[2] === staffId) {
        return { ok: true, duplicate: true };
      }
    }
  }

  // チェック履歴から該当項目のチェック者名を取得
  var checkerName = '';
  var histSheet = ss.getSheetByName(SHEETS.HISTORY);
  if (histSheet && histSheet.getLastRow() > 1) {
    var histData = histSheet.getDataRange().getValues();
    for (var j = 1; j < histData.length; j++) {
      var hRow = histData[j];
      var hBd = businessDateFromTimestamp_(hRow[0]);
      var nr = normalizeHistoryRow_(hRow);
      if (hBd === bd && nr.storeId === storeId && nr.category === category && nr.itemId === itemId) {
        checkerName = nr.staffName || nr.staffDisplay || '';
        break;
      }
    }
  }

  // 確認履歴に追記
  confSheet.appendRow([new Date(), storeId, staffId, staffName, category, itemId, status, checkerName]);

  return { ok: true };
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

  // 確認履歴シート
  var confSheet = ss.getSheetByName(SHEETS.CONFIRMATIONS) || ss.insertSheet(SHEETS.CONFIRMATIONS);
  if (confSheet.getLastRow() === 0) {
    confSheet.appendRow(['確認日時', '店舗ID', '確認者ID', '確認者名', 'カテゴリ', '項目ID', 'ステータス', 'チェック者名']);
  }

  Logger.log('Spreadsheet setup complete.');
}

function checkOmissions() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var bd = getBusinessDate_();
  var items = ss.getSheetByName(SHEETS.ITEMS).getDataRange().getValues();
  var hist = ss.getSheetByName(SHEETS.HISTORY).getDataRange().getValues();

  // その営業日にチェック履歴があるカテゴリを収集
  var activeCategories = {};
  for (var h = 1; h < hist.length; h++) {
    var hd = businessDateFromTimestamp_(hist[h][0]);
    if (hd === bd) {
      var nro = normalizeHistoryRow_(hist[h]);
      activeCategories[nro.category] = true;
    }
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
      var nrm = normalizeHistoryRow_(hist[j]);
      if (cd === bd && nrm.storeId === storeId) {
        doneIds[nrm.itemId] = true;
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

// ============================================================
// LINE 通知機能
// ============================================================

var LINE_CHANNEL_TOKEN = 'sHBVG+uBIJvfIHp1jUGT203t7vPZGh9nz0EzsctysgBh53NSqF6hqOsV+SWeISiF2uqf4ATnxStT26JV9F9S93bvGZEJePmwlHmXkvxGghdvvk09XGPk2wJ2RAKIEGCiLW5msN4SqzhJ8g6A97doUQdB04t89/1O/w1cDnyilFU=';

/** 通知先ユーザーIDリスト */
var LINE_NOTIFY_USERS = [
  'U609974c9d975effb1786fb7542b63e7c',  // 大内
  'Ueabc7f9ca3d49ab9d7be086c38a87bcb'   // 代表
];

/** 全通知先にメッセージ送信 */
function sendLineToAll_(text) {
  for (var i = 0; i < LINE_NOTIFY_USERS.length; i++) {
    sendLineMessage_(LINE_NOTIFY_USERS[i], text);
  }
}

/** LINE Webhook受信: フォロー・メッセージイベントからユーザーIDを記録 */
function handleLineWebhook_(events) {
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var userId = ev.source && ev.source.userId ? ev.source.userId : '';
    if (!userId) continue;

    // スクリプトプロパティに保存（最新のユーザーIDを代表として使用）
    PropertiesService.getScriptProperties().setProperty('LINE_USER_ID', userId);

    // フォローイベント時にウェルカムメッセージ
    if (ev.type === 'follow') {
      sendLineMessage_(userId, '店舗チェック通知を開始しました。チェック未完了時に通知が届きます。');
    }

    // メッセージ受信時にユーザーIDを返信（デバッグ用）
    if (ev.type === 'message' && ev.replyToken) {
      replyLineMessage_(ev.replyToken, 'あなたのユーザーID:\n' + userId);
    }
  }
}

/** LINE Push Message: 指定ユーザーにメッセージ送信 */
function sendLineMessage_(userId, text) {
  var url = 'https://api.line.me/v2/bot/message/push';
  var payload = {
    to: userId,
    messages: [{ type: 'text', text: text }]
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/** LINE Reply Message: Webhookイベントに返信 */
function replyLineMessage_(replyToken, text) {
  var url = 'https://api.line.me/v2/bot/message/reply';
  var payload = {
    replyToken: replyToken,
    messages: [{ type: 'text', text: text }]
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ============================================================
// 定期チェック通知（GASトリガーで実行）
// ============================================================

/**
 * 未完了チェック通知
 * GASの時間ベーストリガーで以下を設定:
 *   - checkAndNotify_1800: 毎日 18:00 に実行
 *   - checkAndNotify_2230: 毎日 22:30 に実行
 *   - checkAndNotify_0700: 毎日 7:00 に実行
 */
function checkAndNotify_1800() {
  notifyIncompleteChecks_('18:00', [
    { category: '開店', label: '開店チェック' },
    { category: '氷プール', timing: '出勤時', label: '氷プールチェック（出勤時）' }
  ]);
}

function checkAndNotify_2230() {
  notifyIncompleteChecks_('22:30', [
    { category: '氷プール', timing: '22時', label: '氷プールチェック（22時）' }
  ]);
}

function checkAndNotify_0700() {
  notifyIncompleteChecks_('7:00', [
    { category: '閉店', label: '閉店チェック' },
    { category: '氷プール', timing: '退勤時', label: '氷プールチェック（退勤時）' }
  ]);
}

function notifyIncompleteChecks_(timeLabel, checks) {
  var storeId = 'STORE001';
  var bd = getBusinessDate_();
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // チェック項目マスタ
  var itemSheet = ss.getSheetByName(SHEETS.ITEMS);
  var itemData = itemSheet.getDataRange().getValues();

  // チェック履歴
  var histSheet = ss.getSheetByName(SHEETS.HISTORY);
  var histData = (histSheet && histSheet.getLastRow() > 1) ? histSheet.getDataRange().getValues() : [];

  // 当日のチェック済み項目IDを収集
  var checkedIds = {};
  for (var i = 1; i < histData.length; i++) {
    var h = histData[i];
    var hbd = businessDateFromTimestamp_(h[0]);
    var nr = normalizeHistoryRow_(h);
    if (hbd === bd && nr.storeId === storeId) {
      var key = nr.category + '|' + nr.itemId;
      checkedIds[key] = true;
    }
  }

  var incomplete = [];

  for (var c = 0; c < checks.length; c++) {
    var chk = checks[c];
    var totalCount = 0;
    var checkedCount = 0;

    for (var j = 1; j < itemData.length; j++) {
      var row = itemData[j];
      if (row[0] !== storeId) continue;
      if (row[1] !== chk.category) continue;
      if (row[6] === false || row[6] === 'FALSE') continue;
      if (chk.timing && row[2] !== chk.timing) continue;

      totalCount++;
      var key2 = chk.category + '|' + row[3];
      if (checkedIds[key2]) checkedCount++;
    }

    if (totalCount > 0 && checkedCount < totalCount) {
      incomplete.push(chk.label + 'が未完了です（' + checkedCount + '/' + totalCount + '）');
    }
  }

  // トイレ清掃の未実施時間帯を取得
  var toiletMissed = getToiletMissedSlots_(storeId, bd, histData);

  if (incomplete.length > 0 || toiletMissed.length > 0) {
    var now = new Date();
    var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    var dateLabel = Utilities.formatDate(now, 'Asia/Tokyo', 'M月d日') + '(' + dayNames[now.getDay()] + ')';
    var msg = '⚠ ' + dateLabel + ' チェック未完了通知（' + timeLabel + '）\n\n';
    if (incomplete.length > 0) {
      msg += incomplete.join('\n');
    }
    if (toiletMissed.length > 0) {
      msg += '\n\nトイレ清掃 未実施時間帯:\n' + toiletMissed.join(', ');
    }
    sendLineToAll_(msg);
    Logger.log('通知送信: ' + msg);
  } else {
    Logger.log(timeLabel + ' 時点で全チェック完了');
  }
}

/**
 * トイレ清掃の未実施時間帯を取得
 */
function getToiletMissedSlots_(storeId, bd, histData) {
  // 現在時刻から判定する時間帯
  var now = new Date();
  var currentHour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'H'), 10);
  var currentLogical = currentHour < 9 ? currentHour + 24 : currentHour;

  var slotOrder = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4];
  var doneHours = {};

  for (var i = 1; i < histData.length; i++) {
    var h = histData[i];
    var hbd = businessDateFromTimestamp_(h[0]);
    var nr = normalizeHistoryRow_(h);
    if (hbd !== bd || nr.storeId !== storeId || nr.category !== 'トイレ清掃') continue;
    var ts = h[0];
    var d = (ts instanceof Date) ? ts : new Date(String(ts));
    var hh = parseInt(Utilities.formatDate(d, 'Asia/Tokyo', 'H'), 10);
    doneHours[hh] = true;
  }

  var missed = [];
  for (var s = 0; s < slotOrder.length; s++) {
    var slot = slotOrder[s];
    var slotLogical = slot < 9 ? slot + 24 : slot;
    if (slotLogical >= currentLogical) break; // 未来のスロットはスキップ
    if (!doneHours[slot]) {
      missed.push((slot < 10 ? '0' : '') + slot + ':00');
    }
  }
  return missed;
}

/** テスト用: LINE通知の動作確認（全員に送信） */
function testLineNotification() {
  sendLineToAll_('テスト通知: 店舗チェック通知が正常に動作しています。');
  Logger.log('テスト通知を全員に送信しました');
}

// ============================================================
// 写真AI判定機能
// ============================================================

/** Google Drive の写真保存フォルダを取得・作成 */
function getOrCreatePhotoFolder_() {
  var parentName = 'チェックシート写真';
  var folders = DriveApp.getFoldersByName(parentName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(parentName);
}

/** 営業日ごとのサブフォルダを取得・作成 */
function getDateFolder_(parentFolder, dateStr) {
  var subs = parentFolder.getFoldersByName(dateStr);
  if (subs.hasNext()) return subs.next();
  return parentFolder.createFolder(dateStr);
}

/**
 * Base64画像をDriveに保存
 * @param {string} base64Data - data:image/jpeg;base64,... 形式またはbase64文字列
 * @param {string} fileName - ファイル名
 * @param {string} result - 'OK' or 'NG' (NGフォルダに分類)
 * @returns {{ fileId: string, fileUrl: string }}
 */
function savePhotoToDrive_(base64Data, fileName, result) {
  var raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(raw), 'image/jpeg', fileName);

  var parent = getOrCreatePhotoFolder_();
  var bd = getBusinessDate_();
  var dateFolder = getDateFolder_(parent, bd);

  // OK/NG サブフォルダ
  var resultLabel = (result === 'NG') ? 'NG' : 'OK';
  var resultFolders = dateFolder.getFoldersByName(resultLabel);
  var resultFolder = resultFolders.hasNext() ? resultFolders.next() : dateFolder.createFolder(resultLabel);

  var file = resultFolder.createFile(blob);
  return { fileId: file.getId(), fileUrl: file.getUrl() };
}

/**
 * Claude Haiku Vision API で写真を判定
 * @param {string} base64Data - Base64画像データ
 * @param {string} itemName - チェック項目名
 * @param {string} category - カテゴリ名
 * @returns {{ result: 'OK'|'NG', reason: string, confidence: number }}
 */
function verifyPhotoWithAI_(base64Data, itemName, category) {
  var claudeApiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!claudeApiKey) {
    throw new Error('CLAUDE_API_KEY がスクリプトプロパティに設定されていません');
  }

  var raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
  var mediaType = 'image/jpeg';
  if (base64Data.indexOf('data:image/png') === 0) mediaType = 'image/png';

  var prompt = '飲食店の業務チェックリストの写真判定を行ってください。\n\n'
    + 'カテゴリ: ' + category + '\n'
    + 'チェック項目: ' + itemName + '\n\n'
    + 'この写真が「' + itemName + '」の作業が適切に完了していることを示しているか判定してください。\n\n'
    + '判定基準:\n'
    + '- OK: 作業が完了している、または完了を示す状態が確認できる\n'
    + '- NG: 作業が未完了、不適切、または関係のない写真\n\n'
    + '以下のJSON形式のみで回答してください（他のテキストは不要）:\n'
    + '{"result": "OK" or "NG", "reason": "判定理由（日本語30文字以内）", "confidence": 0.0-1.0}';

  var payload = {
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: raw
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  };

  var options = {
    method: 'post',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    Logger.log('Claude API error: HTTP ' + code + ' - ' + body);
    throw new Error('AI判定でエラーが発生しました (HTTP ' + code + ')');
  }

  var parsed = JSON.parse(body);
  var text = '';
  if (parsed.content && parsed.content.length > 0) {
    text = parsed.content[0].text || '';
  }

  // JSON部分を抽出
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    Logger.log('Claude response not JSON: ' + text);
    return { result: 'NG', reason: 'AI応答の解析に失敗', confidence: 0 };
  }

  try {
    var judgment = JSON.parse(jsonMatch[0]);
    return {
      result: (judgment.result === 'OK') ? 'OK' : 'NG',
      reason: judgment.reason || '',
      confidence: parseFloat(judgment.confidence) || 0
    };
  } catch (e2) {
    Logger.log('JSON parse error: ' + e2.message + ' / text: ' + text);
    return { result: 'NG', reason: 'AI応答の解析に失敗', confidence: 0 };
  }
}

/**
 * Claude Haiku Vision API で温度計の写真からOCR読み取り
 * @param {string} base64Data - Base64画像データ
 * @returns {{ temperature: number|null, unit: string, confidence: number, reason: string }}
 */
function readTemperatureWithAI_(base64Data) {
  var claudeApiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!claudeApiKey) {
    throw new Error('CLAUDE_API_KEY がスクリプトプロパティに設定されていません');
  }

  var raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
  var mediaType = 'image/jpeg';
  if (base64Data.indexOf('data:image/png') === 0) mediaType = 'image/png';

  var prompt = '飲食店の氷プール温度管理用の写真です。温度計（デジタルまたはアナログ）の表示を読み取ってください。\n\n'
    + '読み取り手順:\n'
    + '1. 写真内の温度計・温度表示を特定する\n'
    + '2. 表示されている数値を正確に読み取る\n'
    + '3. 単位（℃ or °F）を確認する（不明なら℃と仮定）\n\n'
    + '以下のJSON形式のみで回答してください（他のテキストは不要）:\n'
    + '{"temperature": 数値（小数点1桁まで、読み取れない場合はnull）, "unit": "℃" or "°F", "confidence": 0.0-1.0, "reason": "読み取り状況（日本語20文字以内）"}';

  var payload = {
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: raw
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  };

  var options = {
    method: 'post',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    Logger.log('Claude API error (temp OCR): HTTP ' + code + ' - ' + body);
    throw new Error('温度読み取りでエラーが発生しました (HTTP ' + code + ')');
  }

  var parsed = JSON.parse(body);
  var text = '';
  if (parsed.content && parsed.content.length > 0) {
    text = parsed.content[0].text || '';
  }

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    Logger.log('Claude temp OCR response not JSON: ' + text);
    return { temperature: null, unit: '℃', confidence: 0, reason: '読み取り失敗' };
  }

  try {
    var result = JSON.parse(jsonMatch[0]);
    var temp = result.temperature;
    if (temp !== null && temp !== undefined) {
      temp = Math.round(parseFloat(temp) * 10) / 10;
    }
    return {
      temperature: temp,
      unit: result.unit || '℃',
      confidence: parseFloat(result.confidence) || 0,
      reason: result.reason || ''
    };
  } catch (e2) {
    Logger.log('JSON parse error (temp): ' + e2.message + ' / text: ' + text);
    return { temperature: null, unit: '℃', confidence: 0, reason: '読み取り失敗' };
  }
}

/**
 * 温度計写真OCR送信
 * POST body: { action: 'submitTemperaturePhoto', apiKey, data: { storeId, staffId, staffName, category, itemId, itemName, timing, photo (base64) } }
 */
function submitTemperaturePhoto(data) {
  var storeId = data.storeId || 'STORE001';
  var staffId = data.staffId || '';
  var staffName = data.staffName || '';
  var category = data.category || '';
  var itemId = data.itemId || '';
  var itemName = data.itemName || '';
  var timing = data.timing || '';
  var photo = data.photo || '';

  if (!photo) throw new Error('写真データがありません');

  // 1. AI OCR読み取り
  var ocrResult = readTemperatureWithAI_(photo);

  // 2. Drive に保存
  var bd = getBusinessDate_();
  var now = new Date();
  var ts = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  var fileName = itemId + '_temp_' + ts + '.jpg';
  var resultLabel = (ocrResult.temperature !== null) ? 'OK' : 'NG';
  var saved = savePhotoToDrive_(photo, fileName, resultLabel);

  // 3. 写真判定履歴シートに記録
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var pjSheet = ss.getSheetByName(SHEETS.PHOTO_JUDGMENTS);
  if (!pjSheet) {
    pjSheet = ss.insertSheet(SHEETS.PHOTO_JUDGMENTS);
    pjSheet.appendRow(['判定日時', '店舗ID', 'スタッフID', 'スタッフ名', 'カテゴリ', '項目ID', '項目名', '判定結果', '判定理由', '確信度', 'ファイルID', 'ファイルURL']);
  }
  var tempStr = (ocrResult.temperature !== null) ? ocrResult.temperature + '℃' : '読取失敗';
  pjSheet.appendRow([
    now, storeId, staffId, staffName, category, itemId, itemName + '(' + timing + ')',
    resultLabel, tempStr + ' / ' + ocrResult.reason, ocrResult.confidence,
    saved.fileId, saved.fileUrl
  ]);

  // 4. 読み取り成功ならチェック履歴にも記録
  if (ocrResult.temperature !== null) {
    var histSheet = ss.getSheetByName(SHEETS.HISTORY);
    var dt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    var isDup = false;
    if (histSheet.getLastRow() > 1) {
      var histData = histSheet.getDataRange().getValues();
      for (var j = 1; j < histData.length; j++) {
        var hBd = businessDateFromTimestamp_(histData[j][0]);
        var nr = normalizeHistoryRow_(histData[j]);
        if (hBd === bd && nr.storeId === storeId && nr.category === category && nr.itemId === itemId) {
          isDup = true;
          break;
        }
      }
    }
    if (!isDup) {
      histSheet.appendRow([dt, storeId, staffId, staffName, category, itemId, ocrResult.temperature + '°C']);
    }
  }

  // 5. 読み取り失敗時はLINE通知
  if (ocrResult.temperature === null) {
    var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    var dateLabel = Utilities.formatDate(now, 'Asia/Tokyo', 'M月d日') + '(' + dayNames[now.getDay()] + ')';
    var timeLabel = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');
    var ngMsg = '⚠ 温度読み取り失敗\n\n'
      + '日時: ' + dateLabel + ' ' + timeLabel + '\n'
      + 'スタッフ: ' + staffName + '\n'
      + '項目: ' + itemName + '(' + timing + ')\n'
      + '理由: ' + ocrResult.reason + '\n\n'
      + '写真: ' + saved.fileUrl;
    sendLineToAll_(ngMsg);
  }

  return {
    status: 'success',
    temperature: ocrResult.temperature,
    unit: ocrResult.unit,
    confidence: ocrResult.confidence,
    reason: ocrResult.reason,
    fileUrl: saved.fileUrl
  };
}

/**
 * 写真付きチェック送信
 * POST body: { action: 'submitPhotoCheck', apiKey, data: { storeId, staffId, staffName, category, itemId, itemName, photo (base64) } }
 */
function submitPhotoCheck(data) {
  var storeId = data.storeId || 'STORE001';
  var staffId = data.staffId || '';
  var staffName = data.staffName || '';
  var category = data.category || '';
  var itemId = data.itemId || '';
  var itemName = data.itemName || '';
  var photo = data.photo || '';

  if (!photo) throw new Error('写真データがありません');

  // 1. AI判定
  var judgment = verifyPhotoWithAI_(photo, itemName, category);

  // 2. Drive に保存
  var bd = getBusinessDate_();
  var now = new Date();
  var ts = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  var fileName = itemId + '_' + ts + '.jpg';
  var saved = savePhotoToDrive_(photo, fileName, judgment.result);

  // 3. 写真判定履歴シートに記録
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var pjSheet = ss.getSheetByName(SHEETS.PHOTO_JUDGMENTS);
  if (!pjSheet) {
    pjSheet = ss.insertSheet(SHEETS.PHOTO_JUDGMENTS);
    pjSheet.appendRow(['判定日時', '店舗ID', 'スタッフID', 'スタッフ名', 'カテゴリ', '項目ID', '項目名', '判定結果', '判定理由', '確信度', 'ファイルID', 'ファイルURL']);
  }
  pjSheet.appendRow([
    now, storeId, staffId, staffName, category, itemId, itemName,
    judgment.result, judgment.reason, judgment.confidence,
    saved.fileId, saved.fileUrl
  ]);

  // 4. OKならチェック履歴にも記録（通常のチェック完了と同じ扱い）
  if (judgment.result === 'OK') {
    var histSheet = ss.getSheetByName(SHEETS.HISTORY);
    var dt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    // 重複チェック
    var isDup = false;
    if (histSheet.getLastRow() > 1) {
      var histData = histSheet.getDataRange().getValues();
      for (var j = 1; j < histData.length; j++) {
        var hBd = businessDateFromTimestamp_(histData[j][0]);
        var nr = normalizeHistoryRow_(histData[j]);
        if (hBd === bd && nr.storeId === storeId && nr.category === category && nr.itemId === itemId) {
          isDup = true;
          break;
        }
      }
    }
    if (!isDup) {
      histSheet.appendRow([dt, storeId, staffId, staffName, category, itemId, '📷OK']);
    }
  }

  // 5. NGの場合はLINE通知
  if (judgment.result === 'NG') {
    var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    var dateLabel = Utilities.formatDate(now, 'Asia/Tokyo', 'M月d日') + '(' + dayNames[now.getDay()] + ')';
    var timeLabel = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');
    var ngMsg = '🚨 写真判定NG通知\n\n'
      + '日時: ' + dateLabel + ' ' + timeLabel + '\n'
      + 'スタッフ: ' + staffName + '\n'
      + 'カテゴリ: ' + category + '\n'
      + '項目: ' + itemName + '\n'
      + '理由: ' + judgment.reason + '\n'
      + '確信度: ' + Math.round(judgment.confidence * 100) + '%\n\n'
      + '写真: ' + saved.fileUrl;
    sendLineToAll_(ngMsg);
  }

  return {
    status: 'success',
    result: judgment.result,
    reason: judgment.reason,
    confidence: judgment.confidence,
    fileUrl: saved.fileUrl
  };
}

/**
 * 古い写真を自動削除（OK判定のみ30日経過で削除）
 * GASの日次トリガーで実行（例: 毎朝5時）
 */
function cleanupOldPhotos() {
  var parent = null;
  var folders = DriveApp.getFoldersByName('チェックシート写真');
  if (!folders.hasNext()) { Logger.log('写真フォルダなし'); return; }
  parent = folders.next();

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  var dateFolders = parent.getFolders();
  var deletedCount = 0;

  while (dateFolders.hasNext()) {
    var dateFolder = dateFolders.next();
    var folderName = dateFolder.getName();
    // yyyy-MM-dd 形式チェック
    if (!/^\d{4}-\d{2}-\d{2}$/.test(folderName)) continue;
    var folderDate = new Date(folderName + 'T00:00:00+09:00');
    if (isNaN(folderDate.getTime())) continue;

    if (folderDate < cutoff) {
      // OKフォルダのみ削除、NGフォルダは保持
      var okFolders = dateFolder.getFoldersByName('OK');
      if (okFolders.hasNext()) {
        var okFolder = okFolders.next();
        var files = okFolder.getFiles();
        while (files.hasNext()) {
          files.next().setTrashed(true);
          deletedCount++;
        }
        okFolder.setTrashed(true);
      }

      // NGフォルダが無い場合、日付フォルダ自体も削除
      var ngFolders = dateFolder.getFoldersByName('NG');
      if (!ngFolders.hasNext()) {
        // NG無し → 日付フォルダごと削除
        dateFolder.setTrashed(true);
      }
    }
  }

  Logger.log('写真クリーンアップ完了: ' + deletedCount + '枚削除');
  return { status: 'success', deleted: deletedCount };
}

/**
 * 写真判定履歴シートの初期化（手動実行用）
 */
function setupPhotoJudgments() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var pjSheet = ss.getSheetByName(SHEETS.PHOTO_JUDGMENTS) || ss.insertSheet(SHEETS.PHOTO_JUDGMENTS);
  if (pjSheet.getLastRow() === 0) {
    pjSheet.appendRow(['判定日時', '店舗ID', 'スタッフID', 'スタッフ名', 'カテゴリ', '項目ID', '項目名', '判定結果', '判定理由', '確信度', 'ファイルID', 'ファイルURL']);
  }
  Logger.log('写真判定履歴シート作成完了');
}

