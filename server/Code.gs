function doGet(e) {
  var sheetApp = SpreadsheetApp.getActiveSpreadsheet();
  var action = e.parameter.action;
  
  // function doGet(e) {
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
      // Determine role from Role column
      var role = "athlete"; // default
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
    
    // Build row array matching sheet structure
    var newRow = new Array(headers.length);
    newRow[nameColIndex] = athleteName;
    newRow[emailColIndex] = athleteEmail;
    
    // Set default role to Athlete
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

  // ===================== FILTERED LOGBOOK QUERY =====================
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
          wt: logData[i][4],
          reps: logData[i][5]
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

  // ===================== SAVE ENTIRE SESSION =====================
  if (action === "saveEntireSession") {
    var dataObj = JSON.parse(e.parameter.data || "{}");
    var athlete = String(dataObj.athlete || "").trim();
    var prog = String(dataObj.prog || "").trim();
    var dateString = new Date().toLocaleString(); 
    var logDateString = new Date().toLocaleDateString();

    var attSheet = sheetApp.getSheetByName("Attendance");
    if (attSheet) {
      attSheet.appendRow([dateString, athlete, prog]); 
    } else {
      Logger.info("Attendance sheet not found - skipping attendance log");
    }

    var sets = dataObj.sets || [];
    var logSheet = sheetApp.getSheetByName("Logbook");
    if (logSheet && sets.length > 0) {
      for (var i = 0; i < sets.length; i++) { 
        logSheet.appendRow([
          logDateString, 
          athlete, 
          prog, 
          sets[i].exercise, 
          sets[i].weight, 
          sets[i].reps
        ]); 
      }
    } else if (!logSheet) {
      Logger.error("LOGBOOK SHEET MISSING - Historical set data NOT saved!");
    }

    var maxes = dataObj.maxUpdates || {};
    
    var prSummary = "None";
    var prList = [];
    for (var m in maxes) { 
      prList.push(m + ": " + Math.round(Number(maxes[m]))); 
    }
    if (prList.length > 0) { 
      prSummary = prList.join(" | "); 
    }

    var exercisesDone = {};
    for (var s = 0; s < sets.length; s++) { 
      exercisesDone[sets[s].exercise] = true; 
    }
    var exNames = Object.keys(exercisesDone);
    var workoutSummary = exNames.join(", ") + " (" + sets.length + " sets total)";

    var histSheet = sheetApp.getSheetByName("History");
    if (histSheet) {
      histSheet.appendRow([dateString, athlete, prog, workoutSummary, prSummary]);
    } else {
      Logger.warn("History sheet not found - session summary NOT saved");
    }

    if (Object.keys(maxes).length > 0) {
      var athSheet = sheetApp.getSheetByName("Athletes");
      if (athSheet) {
        var athData = athSheet.getDataRange().getValues();
        var headers = athData[0];
        var rowIndex = -1;
        
        for (var r = 1; r < athData.length; r++) { 
          if(String(athData[r][0]).trim().toLowerCase() === athlete.toLowerCase()) { 
            rowIndex = r; 
            break; 
          } 
        }
        
        if (rowIndex > -1) {
          for (var lift in maxes) {
            for (var c = 0; c < headers.length; c++) {
              if (String(headers[c]).trim().toLowerCase() === String(lift).trim().toLowerCase()) {
                athSheet.getRange(rowIndex + 1, c + 1).setValue(Math.round(Number(maxes[lift])));
                break;
              }
            }
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "Success", 
      loggedSets: sets.length,
      maxUpdated: Object.keys(maxes).length,
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
    
    for(var c = 0; c < headers.length; c++) {
      if(String(headers[c]).trim().toLowerCase() === "program assignment") {
        assignColIndex = c;
        break;
      }
    }
    
    if(assignColIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "Error", 
        message: "Program Assignment column not found in Athletes sheet" 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    for(var r = 1; r < data.length; r++) {
      if(String(data[r][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
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

  // ===================== ADD EXERCISE TO CUSTOM LIBRARY =====================
  if (action === "addExercise") {
    var dataObj = JSON.parse(e.parameter.data || "{}");
    var exerciseName = String(dataObj.name || "").trim();
    var videoUrl = String(dataObj.video || "");
    var baseLift = String(dataObj.baseLift || "");
    var multiplier = String(dataObj.multiplier || "");
    
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
        message: "Custom_Library sheet is REQUIRED. Please create it with headers: Exercise Name, Video URL, Base Lift, Multiplier. Run action=initSheets to auto-provision.",
        suggestedAction: "?action=initSheets"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === exerciseName.toLowerCase()) {
        sheet.getRange(i + 1, 1).setValue(exerciseName);
        sheet.getRange(i + 1, 2).setValue(videoUrl);
        sheet.getRange(i + 1, 3).setValue(baseLift);
        sheet.getRange(i + 1, 4).setValue(multiplier);
        
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "Success", 
          message: "Updated existing exercise in Custom_Library",
          operation: "UPDATE"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    sheet.appendRow([exerciseName, videoUrl, baseLift, multiplier]);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "Success", 
      message: "Exercise added to Custom_Library",
      operation: "CREATE"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===================== INIT SHEETS HELPER =====================
  if (action === "initSheets") {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var created = [];
    var skipped = [];
    
    var requiredSheets = [
      {name: "Athletes", headers: ["Name", "PIN", "Back Squat With Barbell - (CORE)", "Deadlift With Barbell.v (CORE)", "Bench Press With Barbell - (CORE)", "Shoulder Press Seated With Barbell - (CORE)", "Barbell Row On Bench - Back.v (CORE)", "Lat Pulldown On Machine - Back (CORE)", "Program Assignment", "Email", "Role"]},
      {name: "Programs", headers: ["Program Name", "Category", "Phase", "Exercise Name", "Sets", "Reps", "% Intensity", "Tempo", "Rest", "Notes"]},
      {name: "History", headers: ["Date", "Athlete", "Program", "Workout Summary", "PR Updates"]},
      {name: "Coaches", headers: ["Coach Name", "Contact Info"]},
      {name: "Custom_Library", headers: ["Exercise Name", "Video URL", "Base Lift", "Multiplier"]},
      {name: "Logbook", headers: ["Date", "Athlete", "Program", "Exercise", "Weight", "Reps"]},
      {name: "Attendance", headers: ["Timestamp", "Athlete", "Program"]}
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

  // ===================== DEFAULT STATUS RESPONSE =====================
  return ContentService.createTextOutput(JSON.stringify({
    status: "API is running",
    availableActions: [
      "getFullData",
      "getAthleteByName",
      "getAthleteByEmail",
      "createAthlete",
      "getLogbookByAthlete",
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
    version: "5.0-role-column"
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

// ===================== HELPER FUNCTION: MERGED LIBRARY LOADER =====================
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
            customData[i][0],
            customData[i][1],
            customData[i][2],
            customData[i][3]
          ]);
        }
      }
    } catch(e) {
      Logger.error("Error reading Custom_Library: " + e.toString());
    }
  }
  
  if (masterLibExists) {
    try {
      var masterSheet = sheetApp.getSheetByName("Exercise_Library");
      if (!masterSheet) masterSheet = sheetApp.getSheetByName("Bunny_Library");
      
      var masterData = masterSheet.getDataRange().getValues();
      if (masterData.length > 1) {
        masterData.shift();
        for (var j = 0; j < masterData.length; j++) {
          masterRows.push([
            masterData[j][0],
            masterData[j][1],
            masterData[j][3],
            masterData[j][4]
          ]);
        }
      }
    } catch(e) {
      Logger.error("Error reading Exercise_Library: " + e.toString());
    }
  }
  
  var seenNames = {};
  var combinedRows = [];
  
  for (var i = 0; i < customRows.length; i++) {
    var nameKey = String(customRows[i][0] || "").trim().toLowerCase();
    if (nameKey && !seenNames[nameKey]) {
      seenNames[nameKey] = true;
      combinedRows.push(customRows[i]);
    }
  }
  
  for (var j = 0; j < masterRows.length; j++) {
    var nameKey = String(masterRows[j][0] || "").trim().toLowerCase();
    if (nameKey && !seenNames[nameKey]) {
      seenNames[nameKey] = true;
      combinedRows.push(masterRows[j]);
    }
  }
  
  return combinedRows;
}
  // (the full doGet function, helpers, etc.)
}
