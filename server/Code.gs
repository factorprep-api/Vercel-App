// ====================================================================
// Code.gs — Factor Prep Backend (Corrected)
// Version: 6.0-epley
// Changes: doPost added, getLatestMaxes added, getLastLoggedWeight added,
//          saveEntireSession fixed (intensity + Epley + Athlete_Maxes),
//          loadMergedLibrary fixed (column alignment), getLogbookByAthlete
//          fixed (column indices), addExercise updated (new columns),
//          initSheets updated (Athlete_Maxes + Logbook headers)
// ====================================================================

// ===================== doPost HANDLER (NEW) =====================
// Enables POST requests — bypasses the 2000-char URL limit for large payloads.
// Merges POST body params with query string params, then routes to doGet.
function doPost(e) {
  var params = {};

  // Copy query string params (if any)
  for (var key in e.parameter) {
    params[key] = e.parameter[key];
  }

  // Parse POST body
  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var key in body) {
        // Stringify objects so doGet's JSON.parse(e.parameter.xxx) pattern works
        if (typeof body[key] === 'object') {
          params[key] = JSON.stringify(body[key]);
        } else {
          params[key] = body[key];
        }
      }
    } catch(err) {
      // Body wasn't JSON — try form-encoded
      try {
        var pairs = e.postData.contents.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split('=');
          if (pair.length === 2) {
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
          }
        }
      } catch(err2) {
        // Fall through — params from query string only
      }
    }
  }

  // Route to doGet with merged params
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

    // Check if athlete already exists by email
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

  // ===================== FILTERED LOGBOOK QUERY (FIXED — column indices) =====================
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
          intensity: logData[i][4],  // FIXED — was [4]=weight, now [4]=intensity
          wt: logData[i][5],         // FIXED — was [5]=reps, now [5]=weight
          reps: logData[i][6]         // FIXED — was missing, now [6]=reps
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
  // Reads from Athlete_Maxes sheet and returns a map of exercise → latest 1RM
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

    // Iterate bottom-up so we grab the most recent entry per exercise first
    for (var i = maxData.length - 1; i >= 1; i--) {
      if (String(maxData[i][1]).trim().toLowerCase() === athleteName.toLowerCase()) {
        var exercise = String(maxData[i][2]).trim();
        var oneRM = Number(maxData[i][3]) || 0;

        // Only store if not already found (first match = most recent)
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
  // Reads from Logbook and returns the most recent weight/intensity for a given exercise
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

    // Iterate bottom-up to find most recent entry
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
        note: "Logbook removed from default output. Use action=getLogbookByAthlete&athlete=Name to retrieve."
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
  // Changes:
  //   1. Writes Intensity to Logbook col E (was missing entirely)
  //   2. Epley 1RM calculation added — runs when exercise Col D = "Yes" AND intensity > 90%
  //   3. New maxes written to Athlete_Maxes sheet (was writing to Athletes inline columns)
  //   4. Removed client-side maxUpdates dependency — backend calculates everything
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

    // --- Logbook (one row per set, now with Intensity column) ---
    var logSheet = sheetApp.getSheetByName("Logbook");
    if (logSheet && sets.length > 0) {
      for (var i = 0; i < sets.length; i++) {
        logSheet.appendRow([
          logDateString,            // Col A: Date
          athlete,                  // Col B: Athlete
          prog,                     // Col C: Program
          sets[i].exercise,         // Col D: Exercise
          sets[i].intensity || "",  // Col E: Intensity (%)  ← FIXED (was missing)
          sets[i].weight,           // Col F: Weight          ← FIXED (was col E)
          sets[i].reps              // Col G: Reps            ← FIXED (was col F)
        ]);
      }
    } else if (!logSheet) {
      Logger.error("LOGBOOK SHEET MISSING - Historical set data NOT saved!");
    }

    // --- Epley 1RM Calculation (NEW) ---
    // Step 1: Build lookup of Epley exercises from merged library
    //         (Col D = "Yes" means this exercise uses Epley formula)
    var library = loadMergedLibrary(sheetApp);
    var epleyExercises = {};
    for (var l = 0; l < library.length; l++) {
      var libExName = String(library[l][0] || "").trim();
      var formulaFlag = String(library[l][3] || "").trim().toLowerCase();
      if (libExName && formulaFlag === "yes") {
        epleyExercises[libExName.toLowerCase()] = true;
      }
    }

    // Step 2: For each qualifying set (Epley exercise + intensity > 90%),
    //         calculate 1RM and track the highest per exercise
    //
    //   Formula (on save):
    //     normalizedWeight = actualWeight / (intensity / 100)
    //     calculated1RM = normalizedWeight * (1 + 0.0333 * reps)
    //
    //   Example: 100kg @ 95% intensity, 5 reps
    //     normalized = 100 / 0.95 = 105.26kg
    //     1RM = 105.26 * (1 + 0.0333 * 5) = 105.26 * 1.1665 = 122.8 ≈ 123kg

    var oneRMCandidates = {}; // exercise name → highest calculated 1RM

    for (var s = 0; s < sets.length; s++) {
      var exName = String(sets[s].exercise || "").trim();
      var intensityRaw = parseFloat(sets[s].intensity) || 0;
      // Normalize: if intensity is stored as whole number (e.g., 95), convert to decimal (0.95)
      var intensityVal = intensityRaw > 1 ? intensityRaw / 100 : intensityRaw;
      var weight = parseFloat(sets[s].weight) || 0;
      var reps = parseInt(sets[s].reps) || 0;

      // Only calculate when: Epley exercise AND intensity > 90% AND valid weight AND reps >= 1
      if (epleyExercises[exName.toLowerCase()] && intensityVal > 0.90 && weight > 0 && reps >= 1) {

        var normalizedWeight = weight / intensityVal;
        var calculated1RM = normalizedWeight * (1 + 0.0333 * reps);
        calculated1RM = Math.round(calculated1RM);

        // Track highest calculated 1RM per exercise (handles multiple sets)
        if (!oneRMCandidates[exName] || calculated1RM > oneRMCandidates[exName]) {
          oneRMCandidates[exName] = calculated1RM;
        }
      }
    }

    // Step 3: Compare calculated 1RMs against stored maxes in Athlete_Maxes
    //         Write new entry only if calculated 1RM is higher than existing

    var maxSheet = sheetApp.getSheetByName("Athlete_Maxes");
    var prList = [];

    if (maxSheet && Object.keys(oneRMCandidates).length > 0) {
      var maxData = maxSheet.getDataRange().getValues();

      for (var ex in oneRMCandidates) {
        var newMax = oneRMCandidates[ex];
        var existingMax = 0;

        // Find the most recent existing max for this athlete + exercise
        for (var m = maxData.length - 1; m >= 1; m--) {
          if (String(maxData[m][1]).trim().toLowerCase() === athlete.toLowerCase() &&
              String(maxData[m][2]).trim().toLowerCase() === ex.toLowerCase()) {
            existingMax = Number(maxData[m][3]) || 0;
            break;
          }
        }

        if (newMax > existingMax) {
          maxSheet.appendRow([new Date(), athlete, ex, newMax]);
          prList.push(ex + ": " + newMax + "kg");
        }
      }
    } else if (!maxSheet && Object.keys(oneRMCandidates).length > 0) {
      Logger.error("ATHLETE_MAXES SHEET MISSING - Cannot store new 1RM records!");
    }

    var prSummary = prList.length > 0 ? prList.join(" | ") : "None";

    // --- History (session summary) ---
    var exercisesDone = {};
    for (var s2 = 0; s2 < sets.length; s2++) {
      exercisesDone[sets[s2].exercise] = true;
    }
    var exNames = Object.keys(exercisesDone);
    var workoutSummary = exNames.join(", ") + " (" + sets.length + " sets total)";

    var histSheet = sheetApp.getSheetByName("History");
    if (histSheet) {
      histSheet.appendRow([dateString, athlete, prog, workoutSummary, prSummary]);
    } else {
      Logger.warn("History sheet not found - session summary NOT saved");
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      loggedSets: sets.length,
      prsCalculated: Object.keys(oneRMCandidates).length,
      prsSaved: prList.length,
      prDetails: prList,
      historySaved: !!histSheet,
      attendanceSaved: !!attSheet
    })).setMimeType(ContentService.MimeType.JSON);
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

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      deletedRows: deletedCount
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== ADD ATHLETE (LEGACY - PIN OPTIONAL) =====================
  if (action === "addAthlete") {
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var pin = e.parameter.pin || "";
    sheet.appendRow([e.parameter.aName, pin]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      legacyPinField: "No longer used with WP Ultimate Member integration"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== DELETE ATHLETE =====================
  if (action === "deleteAthlete") {
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var aName = String(e.parameter.aName || "").trim();
    if (!aName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athlete name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    var deletedCount = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim().toLowerCase() === aName.toLowerCase()) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      deletedRows: deletedCount
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== UPDATE ASSIGNMENT (Individual Athlete) =====================
  if (action === "updateAssignment") {
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    var athleteName = String(e.parameter.aName || "").trim();
    var newAssignment = String(e.parameter.assignment || "").trim();

    if (!athleteName || !newAssignment) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athlete name and assignment required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var headers = data[0];
    var assignColIndex = -1;

    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim().toLowerCase() === "program assignment") {
        assignColIndex = c;
        break;
      }
    }

    if (assignColIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Program Assignment column not found in Athletes sheet"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
        sheet.getRange(r + 1, assignColIndex + 1).setValue(newAssignment);

        return ContentService.createTextOutput(JSON.stringify({
          status: "Success",
          updatedAthlete: athleteName,
          assignedProgram: newAssignment
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Error",
      message: "Athlete not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== ASSIGN PROGRAM TO MULTIPLE ATHLETES =====================
  if (action === "assignProgram") {
    var dataObj = JSON.parse(e.parameter.data || "{}");
    var targetRows = dataObj.athleteRows || [];
    var programAssignment = String(dataObj.programAssignment || "");
    var columnId = dataObj.columnId;

    if (!columnId || columnId < 0) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Invalid column ID"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Athletes sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var updatedCount = 0;
    for (var r = 0; r < targetRows.length; r++) {
      var rowNum = parseInt(targetRows[r]) + 1;
      if (rowNum >= 2) {
        sheet.getRange(rowNum, parseInt(columnId) + 1).setValue(programAssignment);
        updatedCount++;
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      rowsUpdated: updatedCount
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== ADD EXERCISE TO CUSTOM LIBRARY (UPDATED) =====================
  // Custom_Library columns: Exercise Name(A), Video URL(B), Muscle/Category(C),
  //   Formula(D), (empty)(E), Owner Email(F), Notes(G)
  // Changed: now writes Muscle, Formula (Yes for Epley), Owner Email, Notes
  if (action === "addExercise") {
    var dataObj = JSON.parse(e.parameter.data || "{}");
    var exerciseName = String(dataObj.name || "").trim();
    var videoUrl = String(dataObj.video || "");
    var muscle = String(dataObj.muscle || "");
    var formula = String(dataObj.formula || "");        // "Yes" if Epley applies, "" otherwise
    var ownerEmail = String(dataObj.ownerEmail || "");
    var notes = String(dataObj.notes || "");

    if (!exerciseName) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Exercise name required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = sheetApp.getSheetByName("Custom_Library");

    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: "Custom_Library sheet is REQUIRED. Please create it with headers: Exercise Name, Video URL, Muscle/Category, Formula, (empty), Owner Email, Notes. Run action=initSheets to auto-provision.",
        suggestedAction: "?action=initSheets"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === exerciseName.toLowerCase()) {
        // Update existing — write all 7 columns
        sheet.getRange(i + 1, 1).setValue(exerciseName);
        sheet.getRange(i + 1, 2).setValue(videoUrl);
        sheet.getRange(i + 1, 3).setValue(muscle);
        sheet.getRange(i + 1, 4).setValue(formula);
        sheet.getRange(i + 1, 5).setValue("");
        sheet.getRange(i + 1, 6).setValue(ownerEmail);
        sheet.getRange(i + 1, 7).setValue(notes);

        return ContentService.createTextOutput(JSON.stringify({
          status: "Success",
          message: "Updated existing exercise in Custom_Library",
          operation: "UPDATE"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Create new — write all 7 columns
    sheet.appendRow([exerciseName, videoUrl, muscle, formula, "", ownerEmail, notes]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      message: "Exercise added to Custom_Library",
      operation: "CREATE"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== INIT SHEETS HELPER (UPDATED) =====================
  // Added Athlete_Maxes sheet, updated Logbook headers to include Intensity
  if (action === "initSheets") {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var created = [];
    var skipped = [];

    var requiredSheets = [
      {name: "Athletes", headers: ["Name", "PIN", "Back Squat With Barbell - (CORE)", "Deadlift With Barbell.v (CORE)", "Bench Press With Barbell - (CORE)", "Shoulder Press Seated With Barbell - (CORE)", "Barbell Row On Bench - Back.v (CORE)", "Lat Pulldown On Machine - Back (CORE)", "Program Assignment", "Email", "Role"]},
      {name: "Programs", headers: ["Program Name", "Category", "Phase", "Exercise Name", "Sets", "Reps", "% Intensity", "Tempo", "Rest", "Notes"]},
      {name: "History", headers: ["Date", "Athlete", "Program", "Workout Summary", "PR Updates"]},
      {name: "Coaches", headers: ["Coach Name", "Contact Info"]},
      {name: "Custom_Library", headers: ["Exercise Name", "Video URL", "Muscle/Category", "Formula", "", "Owner Email", "Notes"]},
      {name: "Exercise_Library", headers: ["Exercise Name", "Bunny URL", "Muscle/Category", "Formula", "", "Owner Email", "Notes"]},
      {name: "Logbook", headers: ["Date", "Athlete", "Program", "Exercise", "Intensity (%)", "Weight", "Reps"]},
      {name: "Attendance", headers: ["Timestamp", "Athlete", "Program"]},
      {name: "Athlete_Maxes", headers: ["Date", "Athlete", "Exercise", "1RM (kg)"]}  // NEW
    ];

    requiredSheets.forEach(function(info) {
      var existingSheet = ss.getSheetByName(info.name);
      if (!existingSheet) {
        var newSheet = ss.insertSheet(info.name);
        newSheet.appendRow(info.headers);
        created.push(info.name);
      } else {
        skipped.push(info.name);
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      created: created,
      skipped: skipped,
      note: created.length > 0 ? "New sheets created successfully" : "All required sheets already exist"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== DEFAULT STATUS RESPONSE (UPDATED) =====================
  return ContentService.createTextOutput(JSON.stringify({
    status: "API is running",
    availableActions: [
      "getFullData",
      "getAthleteByName",
      "getAthleteByEmail",
      "createAthlete",
      "getLogbookByAthlete",
      "getLatestMaxes",          // NEW
      "getLastLoggedWeight",     // NEW
      "updateProgram",
      "saveEntireSession",
      "saveFullProgram",
      "deleteProgram",
      "addAthlete",
      "deleteAthlete",
      "updateAssignment",
      "assignProgram",
      "addExercise",
      "initSheets"
    ],
    documentation: "https://your-wp-site.com/lumo-api-docs",
    version: "6.0-epley"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ===================== HELPER FUNCTION: VALIDATE REQUIRED SHEETS =====================
function validateRequiredSheets(sheetApp) {
  var required = ["Athletes", "Programs", "Custom_Library"];
  var missing = [];

  required.forEach(function(name) {
    if (!sheetApp.getSheetByName(name)) {
      missing.push(name);
    }
  });

  return missing;
}

// ===================== HELPER FUNCTION: SAFE SHEET READ =====================
function getSafeSheetData(sheetApp, sheetName) {
  var sheet = sheetApp.getSheetByName(sheetName);
  if (!sheet) {
    return [];
  }

  try {
    return sheet.getDataRange().getValues();
  } catch(err) {
    Logger.error("Error reading " + sheetName + ": " + err.toString());
    return [];
  }
}

// ===================== HELPER FUNCTION: MERGED LIBRARY LOADER (FIXED) =====================
// FIX: Both Custom_Library and Exercise_Library now have identical column structures:
//   [0]=Name, [1]=URL, [2]=Muscle/Category, [3]=Formula, [4]=(empty), [5]=Owner Email, [6]=Notes
// Previously Exercise_Library was reading [0,1,3,4] which was wrong.
// Now both read [0,1,2,3,4,5,6] — all 7 columns pushed for frontend access.
function loadMergedLibrary(sheetApp) {
  var customLibExists = false;
  var masterLibExists = false;

  try {
    sheetApp.getSheetByName("Custom_Library");
    customLibExists = true;
  } catch(e) {}

  try {
    sheetApp.getSheetByName("Exercise_Library");
    masterLibExists = true;
  } catch(e) {
    try {
      sheetApp.getSheetByName("Bunny_Library");
      masterLibExists = true;
    } catch(e) {}
  }

  var customRows = [];
  var masterRows = [];

  if (customLibExists) {
    try {
      var customData = sheetApp.getSheetByName("Custom_Library").getDataRange().getValues();
      if (customData.length > 1) {
        customData.shift();
        for (var i = 0; i < customData.length; i++) {
          customRows.push([
            customData[i][0],  // Exercise Name
            customData[i][1],  // Video URL
            customData[i][2],  // Muscle/Category
            customData[i][3],  // Formula (Yes = Epley)
            customData[i][4],  // (empty)
            customData[i][5],  // Owner Email
            customData[i][6]   // Notes
          ]);
        }
      }
    } catch(e) {
      Logger.error("Error reading Custom_Library: " + e.toString());
    }
  }

  if (masterLibExists) {
    try {
