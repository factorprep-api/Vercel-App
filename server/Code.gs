// ====================================================================
// Code.gs — Factor Prep Backend (Corrected)
// Version: 6.0-epley
// ====================================================================

// ===================== doPost HANDLER (NEW) =====================
function doPost(e) {
  var params = {};

  for (var key in e.parameter) {
    params[key] = e.parameter[key];
  }

  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var key in body) {
        if (typeof body[key] === 'object') {
          params[key] = JSON.stringify(body[key]);
        } else {
          params[key] = body[key];
        }
      }
    } catch(err) {
      try {
        var pairs = e.postData.contents.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split('=');
          if (pair.length === 2) {
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
          }
        }
      } catch(err2) {}
    }
  }

  return doGet({ parameter: params });
}

// ===================== MAIN ROUTER =====================
function doGet(e) {
  var sheetApp = SpreadsheetApp.getActiveSpreadsheet();
  var action = e.parameter.action;

  // ===================== AUTH BRIDGE: LOOKUP BY NAME =====================
  if (action === "getAthleteByName") {
    var athleteName = String(e.parameter.name || "").trim();

    if (!athleteName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athlete name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var athSheet = sheetApp.getSheetByName("Athletes");
    if (!athSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var athData = athSheet.getDataRange().getValues();
    var headers = athData[0];
    var rowIndex = -1;

    for (var r = 1; r < athData.length; r++) {
      if (String(athData[r][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
        rowIndex = r;
        break;
      }
    }

    if (rowIndex > -1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Success",
        rowIndex: rowIndex,
        athleteName: String(athData[rowIndex][0]).trim(),
        hasMaxes: athData[rowIndex].some(function(cell) {
          return cell && typeof cell === 'number' && cell > 0;
        })
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "NotFound",
        message: "Athlete not found in roster"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ===================== AUTH BRIDGE: LOOKUP BY EMAIL + ROLE CHECK =====================
  if (action === "getAthleteByEmail") {
    var athleteEmail = String(e.parameter.email || "").trim().toLowerCase();

    if (!athleteEmail) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Email required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var athSheet = sheetApp.getSheetByName("Athletes");
    if (!athSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var athData = athSheet.getDataRange().getValues();
    var headers = athData[0];

    var emailColIndex = -1;
    var nameColIndex = 0;
    var roleColIndex = -1;

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === "email") {
        emailColIndex = c;
      }
      if (h === "role") {
        roleColIndex = c;
      }
    }

    if (emailColIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Email column not found in Athletes sheet"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rowIndex = -1;
    for (var r = 1; r < athData.length; r++) {
      if (String(athData[r][emailColIndex] || "").trim().toLowerCase() === athleteEmail) {
        rowIndex = r;
        break;
      }
    }

    if (rowIndex > -1) {
      var role = "athlete";
      if (roleColIndex >= 0) {
        var roleValue = String(athData[rowIndex][roleColIndex] || "").trim().toLowerCase();
        if (roleValue === "coach") {
          role = "coach";
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "Success",
        role: role,
        rowIndex: rowIndex,
        athleteName: String(athData[rowIndex][nameColIndex]).trim(),
        headers: headers,
        rowData: athData[rowIndex],
        hasMaxes: athData[rowIndex].some(function(cell) {
          return cell && typeof cell === 'number' && cell > 0;
        })
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "NotFound",
      message: "User not found in Athletes sheet"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== CREATE ATHLETE FROM SIGNUP =====================
  if (action === "createAthlete") {
    var athleteName = String(e.parameter.name || "").trim();
    var athleteEmail = String(e.parameter.email || "").trim().toLowerCase();

    if (!athleteName || !athleteEmail) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Name and email required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var athSheet = sheetApp.getSheetByName("Athletes");
    if (!athSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var athData = athSheet.getDataRange().getValues();
    var headers = athData[0];

    var emailColIndex = -1;
    var nameColIndex = 0;
    var roleColIndex = -1;

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === "email") {
        emailColIndex = c;
      }
      if (h === "role") {
        roleColIndex = c;
      }
    }

    if (emailColIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Email column not found in Athletes sheet"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    for (var r = 1; r < athData.length; r++) {
      if (String(athData[r][emailColIndex] || "").trim().toLowerCase() === athleteEmail) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "AlreadyExists",
          message: "Athlete with this email already exists",
          athleteName: String(athData[r][nameColIndex]).trim()
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var newRow = new Array(headers.length);
    newRow[nameColIndex] = athleteName;
    newRow[emailColIndex] = athleteEmail;

    if (roleColIndex >= 0) {
      newRow[roleColIndex] = "Athlete";
    }

    athSheet.appendRow(newRow);

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      message: "Athlete created successfully",
      athleteName: athleteName
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== FILTERED LOGBOOK QUERY (FIXED) =====================
  // Logbook columns: Date(A), Athlete(B), Program(C), Exercise(D), Intensity(E), Weight(F), Reps(G)
  if (action === "getLogbookByAthlete") {
    var athleteName = String(e.parameter.athlete || "").trim();

    if (!athleteName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athlete name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var logSheet = sheetApp.getSheetByName("Logbook");
    if (!logSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Empty",
        message: "Logbook sheet not found",
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var logData = logSheet.getDataRange().getValues();
    var filtered = [];

    for (var i = 1; i < logData.length; i++) {
      if (String(logData[i][1]).trim().toLowerCase() === athleteName.toLowerCase()) {
        filtered.push({
          date: logData[i][0],
          prog: logData[i][2],
          ex: logData[i][3],
          intensity: logData[i][4],
          wt: logData[i][5],
          reps: logData[i][6]
        });
      }
    }

    filtered.reverse();

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      count: filtered.length,
      data: filtered
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== GET LATEST MAXES (NEW) =====================
  // Athlete_Maxes columns: Date(A), Athlete(B), Exercise(C), 1Rm kg(D)
  if (action === "getLatestMaxes") {
    var athleteName = String(e.parameter.athlete || "").trim();

    if (!athleteName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athlete name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var maxSheet = sheetApp.getSheetByName("Athlete_Maxes");
    if (!maxSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Empty",
        message: "Athlete_Maxes sheet not found",
        maxes: {}
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var maxData = maxSheet.getDataRange().getValues();
    var maxes = {};

    for (var i = maxData.length - 1; i >= 1; i--) {
      if (String(maxData[i][1]).trim().toLowerCase() === athleteName.toLowerCase()) {
        var exercise = String(maxData[i][2]).trim();
        var oneRM = Number(maxData[i][3]) || 0;

        if (exercise && oneRM > 0 && !maxes[exercise]) {
          maxes[exercise] = oneRM;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      count: Object.keys(maxes).length,
      maxes: maxes
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== GET LAST LOGGED WEIGHT (NEW) =====================
  // Logbook columns: Date(A), Athlete(B), Program(C), Exercise(D), Intensity(E), Weight(F), Reps(G)
  if (action === "getLastLoggedWeight") {
    var athleteName = String(e.parameter.athlete || "").trim();
    var exerciseName = String(e.parameter.exercise || "").trim();

    if (!athleteName || !exerciseName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athlete name and exercise name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var logSheet = sheetApp.getSheetByName("Logbook");
    if (!logSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "NotFound",
        message: "Logbook sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var logData = logSheet.getDataRange().getValues();

    for (var i = logData.length - 1; i >= 1; i--) {
      if (String(logData[i][1]).trim().toLowerCase() === athleteName.toLowerCase() &&
          String(logData[i][3]).trim().toLowerCase() === exerciseName.toLowerCase()) {

        var intensityRaw = logData[i][4];
        var intensityVal = Number(intensityRaw) || 0;

        return ContentService.createTextOutput(JSON.stringify({
          status: "Success",
          date: logData[i][0],
          program: logData[i][2],
          exercise: String(logData[i][3]).trim(),
          intensity: intensityVal,
          weight: Number(logData[i][5]) || 0,
          reps: Number(logData[i][6]) || 0
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "NotFound",
      message: "No logged weight found for this athlete and exercise"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== GET FULL DATA =====================
  if (action === "getFullData") {
    var missingSheets = validateRequiredSheets(sheetApp);

    if (missingSheets.length > 0) {
      Logger.warn("Warning: Missing sheets: " + missingSheets.join(", "));
    }

    var athletes = sheetApp.getSheetByName("Athletes").getDataRange().getValues();
    var program = sheetApp.getSheetByName("Programs").getDataRange().getValues();
    var combinedLibrary = loadMergedLibrary(sheetApp);
    var coaches = getSafeSheetData(sheetApp, "Coaches");

    var history = getSafeSheetData(sheetApp, "History");
    if (history.length === 0) {
      Logger.warn("Warning: History sheet empty or not found");
    }

    var allData = {
      athletes: athletes,
      program: program,
      library: combinedLibrary,
      history: history,
      coaches: coaches,
      _metadata: {
        timestamp: new Date().toISOString(),
        warning: missingSheets.length > 0 ? "Missing sheets: " + missingSheets.join(", ") : null,
        customLibraryCount: combinedLibrary.length,
        note: "Logbook removed from default output. Use action=getLogbookByAthlete to retrieve."
      }
    };

    return ContentService.createTextOutput(JSON.stringify(allData)).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== UPDATE PROGRAM =====================
  if (action === "updateProgram") {
    var sheet = sheetApp.getSheetByName("Programs");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Programs sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    var oldName = String(e.parameter.oldName || "").trim();

    if (!oldName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Old program name required for replacement"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === oldName) {
        sheet.deleteRow(i + 1);
      }
    }

    var programData = JSON.parse(e.parameter.programData || "[]");
    for (var k = 0; k < programData.length; k++) {
      sheet.appendRow(programData[k]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      replaced: oldName,
      rowCount: programData.length
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== SAVE ENTIRE SESSION (FIXED) =====================
  if (action === "saveEntireSession") {
    var dataObj = JSON.parse(e.parameter.data || "{}");
    var athlete = String(dataObj.athlete || "").trim();
    var prog = String(dataObj.prog || "").trim();
    var dateString = new Date().toLocaleString();
    var logDateString = new Date().toLocaleDateString();

    // --- Attendance ---
    var attSheet = sheetApp.getSheetByName("Attendance");
    if (attSheet) {
      attSheet.appendRow([dateString, athlete, prog]);
    } else {
      Logger.info("Attendance sheet not found - skipping attendance log");
    }

    var sets = dataObj.sets || [];

    // --- Logbook (one row per set, with Intensity column) ---
    // Columns: Date(A), Athlete(B), Program(C), Exercise(D), Intensity(E), Weight(F), Reps(G)
    var logSheet = sheetApp.getSheetByName("Logbook");
    if (logSheet && sets.length > 0) {
      for (var i = 0; i < sets.length; i++) {
        logSheet.appendRow([
          logDateString,
          athlete,
          prog,
          sets[i].exercise,
          sets[i].intensity || "",
          sets[i].weight,
          sets[i].reps
        ]);
      }
    } else if (!logSheet) {
      Logger.error("LOGBOOK SHEET MISSING - Historical set data NOT saved!");
    }

  // ===================== SAVE FULL PROGRAM =====================
  if (action === "saveFullProgram") {
    var sheet = sheetApp.getSheetByName("Programs");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Programs sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var programData = JSON.parse(e.parameter.programData || "[]");
    for (var k = 0; k < programData.length; k++) {
      sheet.appendRow(programData[k]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      rowCount: programData.length
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== DELETE PROGRAM =====================
  if (action === "deleteProgram") {
    var sheet = sheetApp.getSheetByName("Programs");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Programs sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var pName = String(e.parameter.pName || "").trim();
    if (!pName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Program name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    var deletedCount = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === pName) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }

