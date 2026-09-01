function doPost(e) {
  var params = {};
  if (e && e.parameter) {
    for (var key in e.parameter) {
      params[key] = e.parameter[key];
    }
  }
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var bKey in body) {
        if (typeof body[bKey] === 'object' && body[bKey] !== null) {
          params[bKey] = JSON.stringify(body[bKey]);
        } else {
          params[bKey] = body[bKey];
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

function doGet(e) {
  e = e || { parameter: {} };
  var sheetApp = SpreadsheetApp.getActiveSpreadsheet();
  var action = e.parameter.action;

  // ==========================================
  // ATHLETE LOOKUP & CREATION
  // ==========================================

  if (action === "getAthleteByName") {
    var athleteName = String(e.parameter.name || "").trim();
    if (!athleteName) {
      return jsonResponse({ status: "Error", message: "Athlete name required" });
    }
    var athSheet = sheetApp.getSheetByName("Athletes");
    if (!athSheet) {
      return jsonResponse({ status: "Error", message: "Athletes sheet not found" });
    }
    var athData = athSheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var r = 1; r < athData.length; r++) {
      if (String(athData[r][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
        rowIndex = r;
        break;
      }
    }
    if (rowIndex > -1) {
      return jsonResponse({
        status: "Success",
        rowIndex: rowIndex,
        athleteName: String(athData[rowIndex][0]).trim(),
        hasMaxes: athData[rowIndex].some(function(cell) { return cell && typeof cell === 'number' && cell > 0; })
      });
    } else {
      return jsonResponse({ status: "NotFound", message: "Athlete not found in roster" });
    }
  }

  if (action === "getAthleteByEmail") {
    var athleteEmail = String(e.parameter.email || "").trim().toLowerCase();
    if (!athleteEmail) {
      return jsonResponse({ status: "Error", message: "Email required" });
    }
    var athSheet = sheetApp.getSheetByName("Athletes");
    if (!athSheet) {
      return jsonResponse({ status: "Error", message: "Athletes sheet not found" });
    }
    var athData = athSheet.getDataRange().getValues();
    var headers = athData[0] || [];
    var emailColIndex = -1, nameColIndex = 0, roleColIndex = -1;
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === "email") { emailColIndex = c; }
      if (h === "role") { roleColIndex = c; }
    }
    if (emailColIndex === -1) {
      return jsonResponse({ status: "Error", message: "Email column not found in Athletes sheet" });
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
        if (roleValue === "coach") { role = "coach"; }
      }
      return jsonResponse({
        status: "Success",
        role: role,
        rowIndex: rowIndex,
        athleteName: String(athData[rowIndex][nameColIndex]).trim(),
        headers: headers,
        rowData: athData[rowIndex],
        hasMaxes: athData[rowIndex].some(function(cell) { return cell && typeof cell === 'number' && cell > 0; })
      });
    }
    return jsonResponse({ status: "NotFound", message: "User not found in Athletes sheet" });
  }

  if (action === "createAthlete") {
    var athleteName = String(e.parameter.name || "").trim();
    var athleteEmail = String(e.parameter.email || "").trim().toLowerCase();
    if (!athleteName || !athleteEmail) {
      return jsonResponse({ status: "Error", message: "Name and email required" });
    }
    var athSheet = sheetApp.getSheetByName("Athletes");
    if (!athSheet) {
      return jsonResponse({ status: "Error", message: "Athletes sheet not found" });
    }
    var athData = athSheet.getDataRange().getValues();
    var headers = athData[0] || [];
    var emailColIndex = -1, nameColIndex = 0, roleColIndex = -1;
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim().toLowerCase();
      if (h === "email") { emailColIndex = c; }
      if (h === "role") { roleColIndex = c; }
    }
    if (emailColIndex === -1) {
      return jsonResponse({ status: "Error", message: "Email column not found in Athletes sheet" });
    }
    for (var r = 1; r < athData.length; r++) {
      if (String(athData[r][emailColIndex] || "").trim().toLowerCase() === athleteEmail) {
        return jsonResponse({
          status: "AlreadyExists",
          message: "Athlete with this email already exists",
          athleteName: String(athData[r][nameColIndex]).trim()
        });
      }
    }
    var newRow = new Array(headers.length).fill("");
    newRow[nameColIndex] = athleteName;
    newRow[emailColIndex] = athleteEmail;
    if (roleColIndex >= 0) { newRow[roleColIndex] = "Athlete"; }
    athSheet.appendRow(newRow);
    return jsonResponse({ status: "Success", message: "Athlete created successfully", athleteName: athleteName });
  }

  // ==========================================
  // LOGBOOK & MAXES
  // ==========================================

  if (action === "getLogbookByAthlete") {
    var athleteName = String(e.parameter.athlete || "").trim();
    if (!athleteName) {
      return jsonResponse({ status: "Error", message: "Athlete name required" });
    }
    var logSheet = sheetApp.getSheetByName("Logbook");
    if (!logSheet) {
      return jsonResponse({ status: "Empty", message: "Logbook sheet not found", data: [] });
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
    return jsonResponse({ status: "Success", count: filtered.length, data: filtered });
  }

  if (action === "getLatestMaxes") {
    var athleteName = String(e.parameter.athlete || "").trim();
    if (!athleteName) {
      return jsonResponse({ status: "Error", message: "Athlete name required" });
    }
    var maxSheet = sheetApp.getSheetByName("Athlete_Maxes");
    if (!maxSheet) {
      return jsonResponse({ status: "Empty", message: "Athlete_Maxes sheet not found", maxes: {} });
    }
    var maxData = maxSheet.getDataRange().getValues();
    var maxes = {};
    for (var i = maxData.length - 1; i >= 1; i--) {
      if (String(maxData[i][1]).trim().toLowerCase() === athleteName.toLowerCase()) {
        var exercise = String(maxData[i][2]).trim();
        var oneRM = Number(maxData[i][3]) || 0;
        if (exercise && oneRM > 0 && !maxes[exercise]) { maxes[exercise] = oneRM; }
      }
    }
    return jsonResponse({ status: "Success", count: Object.keys(maxes).length, maxes: maxes });
  }

  if (action === "getLastLoggedWeight") {
    var athleteName = String(e.parameter.athlete || "").trim();
    var exerciseName = String(e.parameter.exercise || "").trim();
    if (!athleteName || !exerciseName) {
      return jsonResponse({ status: "Error", message: "Athlete name and exercise name required" });
    }
    var logSheet = sheetApp.getSheetByName("Logbook");
    if (!logSheet) {
      return jsonResponse({ status: "NotFound", message: "Logbook sheet not found" });
    }
    var logData = logSheet.getDataRange().getValues();
    for (var i = logData.length - 1; i >= 1; i--) {
      if (String(logData[i][1]).trim().toLowerCase() === athleteName.toLowerCase() &&
          String(logData[i][3]).trim().toLowerCase() === exerciseName.toLowerCase()) {
        return jsonResponse({
          status: "Success",
          date: logData[i][0],
          program: logData[i][2],
          exercise: String(logData[i][3]).trim(),
          intensity: Number(logData[i][4]) || 0,
          weight: Number(logData[i][5]) || 0,
          reps: Number(logData[i][6]) || 0
        });
      }
    }
    return jsonResponse({ status: "NotFound", message: "No logged weight found for this athlete and exercise" });
  }

  // ==========================================
  // DATA FETCHING
  // ==========================================

  if (action === "getFullData") {
    var missingSheets = validateRequiredSheets(sheetApp);
    if (missingSheets.length > 0) {
      console.warn("Warning: Missing sheets: " + missingSheets.join(", "));
    }
    var athletes = getSafeSheetData(sheetApp, "Athletes");
    var program = getSafeSheetData(sheetApp, "Programs");
    var combinedLibrary = loadMergedLibrary(sheetApp);
    var coaches = getSafeSheetData(sheetApp, "Coaches");
    var history = getSafeSheetData(sheetApp, "History");
    if (history.length === 0) {
      console.warn("Warning: History sheet empty or not found");
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
    return jsonResponse(allData);
  }

  if (action === "getAthletes") {
    var athletesData = getSafeSheetData(sheetApp, "Athletes");
    return jsonResponse({ athletes: athletesData });
  }

  if (action === "getPrograms") {
    var programsData = getSafeSheetData(sheetApp, "Programs");
    return jsonResponse({ programs: programsData });
  }

  if (action === "getLibrary") {
    var libraryData = loadMergedLibrary(sheetApp);
    return jsonResponse({ library: libraryData });
  }

  if (action === "getHelpVideos") {
    var helpData = getSafeSheetData(sheetApp, "Help_Videos");
    return jsonResponse({ helpVideos: helpData });
  }

  if (action === "updateProgram") {
    var sheet = sheetApp.getSheetByName("Programs");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Programs sheet not found" }); }
    var data = sheet.getDataRange().getValues();
    var oldName = String(e.parameter.oldName || "").trim();
    if (!oldName) { return jsonResponse({ status: "Error", message: "Old program name required for replacement" }); }
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === oldName) { sheet.deleteRow(i + 1); }
    }
    var programData = [];
    try {
      programData = JSON.parse(e.parameter.programData || "[]");
    } catch(err) { programData = []; }
    for (var k = 0; k < programData.length; k++) { sheet.appendRow(programData[k]); }
    return jsonResponse({ status: "Success", replaced: oldName, rowCount: programData.length });
  }

  // ==========================================
  // UNIVERSAL MAX/PB ENGINE
  // ==========================================
  if (action === "saveEntireSession") {
    var dataObj = parsePayload(e);
    var athlete = String(dataObj.athlete || "").trim();
    var prog = String(dataObj.prog || "").trim();
    var isoTimestamp = new Date().toISOString();
    
    // 1. Log Attendance
    var attSheet = sheetApp.getSheetByName("Attendance");
    if (attSheet) { attSheet.appendRow([isoTimestamp, athlete, prog]); }
    
    // 2. Log sets to Logbook
    var sets = dataObj.sets || [];
    var logSheet = sheetApp.getSheetByName("Logbook");
    if (logSheet && sets.length > 0) {
      for (var i = 0; i < sets.length; i++) {
        logSheet.appendRow([
          isoTimestamp,
          athlete,
          prog,
          sets[i].exercise,
          sets[i].intensity || "",
          sets[i].weight,
          sets[i].reps
        ]);
      }
    }

    // 3. Map the Library to find which formula to use
    var library = loadMergedLibrary(sheetApp);
    var exCalcTypes = {};
    for (var l = 0; l < library.length; l++) {
      var libExName = String(library[l][0] || "").trim().toLowerCase();
      var formulaFlag = String(library[l][3] || "").trim().toLowerCase();
      if (libExName && formulaFlag) {
        if (formulaFlag === "yes" || formulaFlag === "weight") exCalcTypes[libExName] = "weight";
        else if (formulaFlag === "time") exCalcTypes[libExName] = "time";
        else if (formulaFlag === "distance") exCalcTypes[libExName] = "distance";
      }
    }

    // 4. Calculate PBs/Maxes across all metrics
    var newMaxCandidates = {}; 
    
    for (var s = 0; s < sets.length; s++) {
      var exName = String(sets[s].exercise || "").trim();
      var lowerEx = exName.toLowerCase();
      var calcType = exCalcTypes[lowerEx];
      if (!calcType) continue;

      var intensityRaw = parseFloat(sets[s].intensity) || 0;
      var intensityVal = intensityRaw > 1 ? intensityRaw / 100 : intensityRaw;
      
      // STRICT PB GATEKEEPER: Only calculate PBs on 100% effort sets!
      if (intensityVal < 1.00) continue;

      if (calcType === "weight") { 
        var weight = parseFloat(sets[s].weight) || 0;
        var repsNum = parseInt(sets[s].reps) || 0; 
        if (weight > 0 && repsNum >= 1) {
          var normalizedWeight = weight / intensityVal;
          var calculated1RM = Math.round(normalizedWeight * (1 + 0.0333 * repsNum));
          if (!newMaxCandidates[exName] || calculated1RM > newMaxCandidates[exName].val) {
            newMaxCandidates[exName] = { val: calculated1RM, type: "weight" };
          }
        }
      }
      else if (calcType === "time") {
        var timeSecs = parseTimeToSecondsGAS(sets[s].reps); 
        if (timeSecs > 0) {
          var impliedMaxTime = timeSecs * intensityVal;
          if (!newMaxCandidates[exName] || impliedMaxTime < newMaxCandidates[exName].val) {
            newMaxCandidates[exName] = { val: impliedMaxTime, type: "time" };
          }
        }
      }
      else if (calcType === "distance") {
        var distMeters = parseDistanceToMetersGAS(sets[s].reps);
        if (distMeters > 0) {
          var impliedMaxDist = distMeters / intensityVal;
          if (!newMaxCandidates[exName] || impliedMaxDist > newMaxCandidates[exName].val) {
            newMaxCandidates[exName] = { val: impliedMaxDist, type: "distance" };
          }
        }
      }
    }

    // 5. Compare with existing Maxes & Save
    var maxSheet = sheetApp.getSheetByName("Athlete_Maxes");
    var prList = [];
    
    if (maxSheet && Object.keys(newMaxCandidates).length > 0) {
      var maxData = maxSheet.getDataRange().getValues();

      for (var ex in newMaxCandidates) {
        var newMaxObj = newMaxCandidates[ex];
        var newMax = newMaxObj.val;
        var cType = newMaxObj.type;

        var existingMax = 0;
        for (var m = maxData.length - 1; m >= 1; m--) {
          if (String(maxData[m][1]).trim().toLowerCase() === athlete.toLowerCase() &&
              String(maxData[m][2]).trim().toLowerCase() === ex.toLowerCase()) {
            existingMax = Number(maxData[m][3]) || 0;
            break;
          }
        }

        var isPR = false;
        if (cType === "time") {
          if (existingMax === 0 || newMax < existingMax) isPR = true;
        } else {
          if (existingMax === 0 || newMax > existingMax) isPR = true;
        }

        if (isPR) {
          var finalMaxToSave = Math.round(newMax * 10) / 10;
          maxSheet.appendRow([isoTimestamp, athlete, ex, finalMaxToSave]);

          var prString = "";
          if (cType === "weight") prString = finalMaxToSave + "kg";
          else if (cType === "distance") prString = finalMaxToSave + "m";
          else if (cType === "time") {
            var mns = Math.floor(finalMaxToSave / 60);
            var scs = Math.round(finalMaxToSave % 60);
            if (mns > 0) prString = mns + ":" + (scs < 10 ? "0" : "") + scs;
            else prString = finalMaxToSave + "s";
          }
          prList.push(ex + ": " + prString);
        }
      }
    }

    // 6. Log Session Summary
    var prSummary = prList.length > 0 ? prList.join(" | ") : "None";
    var exercisesDone = {};
    for (var s2 = 0; s2 < sets.length; s2++) { exercisesDone[sets[s2].exercise] = true; }
    var workoutSummary = Object.keys(exercisesDone).join(", ") + " (" + sets.length + " sets total)";
    
    var histSheet = sheetApp.getSheetByName("History");
    if (histSheet) { histSheet.appendRow([isoTimestamp, athlete, prog, workoutSummary, prSummary]); }
    
    return jsonResponse({
      status: "Success",
      loggedSets: sets.length,
      prsCalculated: Object.keys(newMaxCandidates).length,
      prsSaved: prList.length,
      prDetails: prList
    });
  }

  // ==========================================
  // POD ENDPOINTS (WELLNESS, MEDICAL, SCHEDULE)
  // ==========================================
  
  if (action === "saveWellness") {
    var sheet = sheetApp.getSheetByName("Wellness_Logs");
    if (!sheet) return jsonResponse({ status: "Error", message: "Wellness_Logs sheet not found" });
    var dataObj = parsePayload(e);
    sheet.appendRow([
      new Date().toISOString(),
      dataObj.email || "",
      dataObj.athlete || "",
      dataObj.grip || "",
      dataObj.feeling || "",
      dataObj.soreness || "",
      dataObj.sleep || "",
      dataObj.nutrition || ""
    ]);
    return jsonResponse({ status: "Success" });
  }

  if (action === "getWellness") {
    var data = getSafeSheetData(sheetApp, "Wellness_Logs");
    return jsonResponse({ data: data });
  }

  if (action === "saveSchedule") {
    var sheet = sheetApp.getSheetByName("Schedule_Master");
    if (!sheet) return jsonResponse({ status: "Error", message: "Schedule_Master sheet not found" });
    
    var dataObj = parsePayload(e);
    
    var propMins = Number(dataObj.proposedMins) || 0;
    var propRpe = Number(dataObj.proposedRpe) || 0;
    var propLoad = propMins * propRpe;

    var actMins = Number(dataObj.actualMins) || 0;
    var actRpe = Number(dataObj.actualRpe) || 0;
    var actLoad = actMins * actRpe;

    sheet.appendRow([
      new Date().toISOString(),
      dataObj.email || "",
      dataObj.athlete || "",
      dataObj.type || "",
      propMins,
      propRpe,
      propLoad,
      actMins,
      actRpe,
      actLoad,
      dataObj.location || "",
      dataObj.notes || ""
    ]);
    return jsonResponse({ status: "Success" });
  }

  if (action === "getSchedule") {
    var data = getSafeSheetData(sheetApp, "Schedule_Master");
    return jsonResponse({ data: data });
  }

  if (action === "saveMedical") {
    var sheet = sheetApp.getSheetByName("Medical_Vault");
    if (!sheet) return jsonResponse({ status: "Error", message: "Medical_Vault sheet not found" });
    var dataObj = parsePayload(e);
    sheet.appendRow([
      new Date().toISOString(),
      dataObj.email || "",
      dataObj.athlete || "",
      dataObj.bodyPart || "",
      dataObj.pain || "",
      dataObj.mechanism || "",
      dataObj.trainingStatus || "",
      dataObj.notes || "",
      dataObj.isResolved || "No",
      ""
    ]);
    return jsonResponse({ status: "Success" });
  }

  if (action === "getMedical") {
    var data = getSafeSheetData(sheetApp, "Medical_Vault");
    return jsonResponse({ data: data });
  }

  // ==========================================
  // PROGRAM & LIBRARY MANAGEMENT
  // ==========================================

  if (action === "saveFullProgram") {
    var sheet = sheetApp.getSheetByName("Programs");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Programs sheet not found" }); }
    var programData = [];
    try {
      programData = JSON.parse(e.parameter.programData || "[]");
    } catch(err) { programData = []; }
    for (var k = 0; k < programData.length; k++) { sheet.appendRow(programData[k]); }
    return jsonResponse({ status: "Success", rowCount: programData.length });
  }

  if (action === "deleteProgram") {
    var sheet = sheetApp.getSheetByName("Programs");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Programs sheet not found" }); }
    var pName = String(e.parameter.pName || "").trim();
    if (!pName) { return jsonResponse({ status: "Error", message: "Program name required" }); }
    var data = sheet.getDataRange().getValues();
    var deletedCount = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === pName) { sheet.deleteRow(i + 1); deletedCount++; }
    }
    return jsonResponse({ status: "Success", deletedRows: deletedCount });
  }

  if (action === "addAthlete") {
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Athletes sheet not found" }); }
    var pin = e.parameter.pin || "";
    sheet.appendRow([e.parameter.aName, pin]);
    return jsonResponse({ status: "Success", legacyPinField: "No longer used with WP Ultimate Member integration" });
  }

  if (action === "deleteAthlete") {
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Athletes sheet not found" }); }
    var aName = String(e.parameter.aName || "").trim();
    if (!aName) { return jsonResponse({ status: "Error", message: "Athlete name required" }); }
    var data = sheet.getDataRange().getValues();
    var deletedCount = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim().toLowerCase() === aName.toLowerCase()) { sheet.deleteRow(i + 1); deletedCount++; }
    }
    return jsonResponse({ status: "Success", deletedRows: deletedCount });
  }

  if (action === "updateAssignment") {
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Athletes sheet not found" }); }
    var data = sheet.getDataRange().getValues();
    var athleteName = String(e.parameter.aName || "").trim();
    var newAssignment = String(e.parameter.assignment || "").trim();
    if (!athleteName || !newAssignment) {
      return jsonResponse({ status: "Error", message: "Athlete name and assignment required" });
    }
    
    var headers = data[0] || [];
    var assignColIndex = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim().toLowerCase() === "program assignment") { assignColIndex = c; break; }
    }
    if (assignColIndex === -1) {
      return jsonResponse({ status: "Error", message: "Program Assignment column not found" });
    }
    
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
        var targetCell = sheet.getRange(r + 1, assignColIndex + 1);
        var currentVal = String(targetCell.getValue() || "").trim();
        
        var valArr = currentVal ? currentVal.split(',').map(function(s){return s.trim();}) : [];
        if (valArr.indexOf(newAssignment) === -1) {
          var finalVal = currentVal ? currentVal + ", " + newAssignment : newAssignment;
          targetCell.setValue(finalVal);
        }
        return jsonResponse({ status: "Success", updatedAthlete: athleteName, assignedProgram: newAssignment });
      }
    }
    return jsonResponse({ status: "Error", message: "Athlete not found" });
  }

  if (action === "assignProgram") {
    var dataObj = parsePayload(e);
    var targetRows = dataObj.athleteRows || [];
    var programAssignment = String(dataObj.programAssignment || "").trim();
    var columnId = dataObj.columnId;
    if (columnId === undefined || columnId === null || columnId < 0) {
      return jsonResponse({ status: "Error", message: "Invalid column ID" });
    }
    
    var sheet = sheetApp.getSheetByName("Athletes");
    if (!sheet) { return jsonResponse({ status: "Error", message: "Athletes sheet not found" }); }
    
    var updatedCount = 0;
    for (var r = 0; r < targetRows.length; r++) {
      var rowNum = parseInt(targetRows[r]) + 1;
      if (rowNum >= 2) { 
        var targetCell = sheet.getRange(rowNum, parseInt(columnId) + 1);
        var currentVal = String(targetCell.getValue() || "").trim();
        
        var valArr = currentVal ? currentVal.split(',').map(function(s){return s.trim();}) : [];
        if (valArr.indexOf(programAssignment) === -1) {
          var finalVal = currentVal ? currentVal + ", " + programAssignment : programAssignment;
          targetCell.setValue(finalVal);
        }
        updatedCount++; 
      }
    }
    return jsonResponse({ status: "Success", rowsUpdated: updatedCount });
  }

  if (action === "addExercise") {
    var dataObj = parsePayload(e);
    var exerciseName = String(dataObj.name || "").trim();
    var videoUrl = String(dataObj.video || "");
    var muscle = String(dataObj.muscle || "");
    var formula = String(dataObj.formula || "");
    var ownerEmail = String(dataObj.ownerEmail || "");
    var notes = String(dataObj.notes || "");
    if (!exerciseName) { return jsonResponse({ status: "Error", message: "Exercise name required" }); }
    var sheet = sheetApp.getSheetByName("Custom_Library");
    if (!sheet) {
      return jsonResponse({
        status: "Error",
        message: "Custom_Library sheet is REQUIRED. Run action=initSheets to auto-provision.",
        suggestedAction: "?action=initSheets"
      });
    }
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === exerciseName.toLowerCase()) {
        sheet.getRange(i + 1, 1).setValue(exerciseName);
        sheet.getRange(i + 1, 2).setValue(videoUrl);
        sheet.getRange(i + 1, 3).setValue(muscle);
        sheet.getRange(i + 1, 4).setValue(formula);
        sheet.getRange(i + 1, 5).setValue("");
        sheet.getRange(i + 1, 6).setValue(ownerEmail);
        sheet.getRange(i + 1, 7).setValue(notes);
        return jsonResponse({ status: "Success", message: "Updated existing exercise in Custom_Library", operation: "UPDATE" });
      }
    }
    sheet.appendRow([exerciseName, videoUrl, muscle, formula, "", ownerEmail, notes]);
    return jsonResponse({ status: "Success", message: "Exercise added to Custom_Library", operation: "CREATE" });
  }

  if (action === "initSheets") {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var created = [];
    var skipped = [];
    var requiredSheets = [
      {name: "Athletes", headers: ["Name", "PIN", "Back Squat With Barbell - (CORE)", "Deadlift With Barbell.v (CORE)", "Bench Press With Barbell - (CORE)", "Shoulder Press Seated With Barbell - (CORE)", "Barbell Row On Bench - Back.v (CORE)", "Lat Pulldown On Machine - Back (CORE)", "Program Assignment", "Email", "Role", "Active Pods"]},
      {name: "Programs", headers: ["Program Name", "Category", "Phase", "Exercise Name", "Sets", "Reps", "% Intensity", "Tempo", "Rest", "Notes"]},
      {name: "History", headers: ["Date", "Athlete", "Program", "Workout Summary", "PR Updates"]},
      {name: "Coaches", headers: ["Coach Name", "Contact Info"]},
      {name: "Custom_Library", headers: ["Exercise Name", "Video URL", "Muscle/Category", "Formula", "", "Owner Email", "Notes"]},
      {name: "Exercise_Library", headers: ["Exercise Name", "Bunny URL", "Muscle/Category", "Formula", "", "Owner Email", "Notes"]},
      {name: "Logbook", headers: ["Date", "Athlete", "Program", "Exercise", "Intensity (%)", "Weight", "Reps"]},
      {name: "Attendance", headers: ["Timestamp", "Athlete", "Program"]},
      {name: "Athlete_Maxes", headers: ["Date", "Athlete", "Exercise", "1RM"]},
      // POD SHEETS
      {name: "Wellness_Logs", headers: ["Date", "Email", "Athlete", "Grip", "Feeling", "Soreness", "Sleep", "Nutrition"]},
      {name: "Medical_Vault", headers: ["Date Logged", "Email", "Athlete", "Body Part", "Pain Level", "Mechanism", "Training Status", "Notes", "Is Resolved", "Date Resolved"]},
      {name: "Schedule_Master", headers: ["Date", "Email", "Athlete", "Type", "Proposed Mins", "Proposed RPE", "Proposed Load", "Actual Mins", "Actual RPE", "Actual Load", "Location", "Coach Notes"]}
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
    return jsonResponse({
      status: "Success",
      created: created,
      skipped: skipped,
      note: created.length > 0 ? "New sheets created successfully" : "All required sheets already exist"
    });
  }

  return jsonResponse({
    status: "API is running",
    availableActions: [
      "getFullData", "getAthletes", "getPrograms", "getLibrary", "getAthleteByName", "getAthleteByEmail",
      "createAthlete", "getLogbookByAthlete", "getLatestMaxes", "getLastLoggedWeight", "updateProgram",
      "saveEntireSession", "saveFullProgram", "deleteProgram", "addAthlete", "deleteAthlete",
      "updateAssignment", "assignProgram", "addExercise", "initSheets", "saveWellness",
      "getWellness", "saveSchedule", "getSchedule", "saveMedical", "getMedical"
    ],
    version: "9.1-audit-engine-fixed"
  });
}

// ==========================================
// UTILITY & HELPER FUNCTIONS
// ==========================================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function parsePayload(e) {
  if (!e || !e.parameter) return {};
  if (e.parameter.data) {
    try {
      if (typeof e.parameter.data === 'string') {
        return JSON.parse(e.parameter.data);
      }
      return e.parameter.data;
    } catch(err) {
      return e.parameter;
    }
  }
  return e.parameter;
}

function validateRequiredSheets(sheetApp) {
  var required = ["Athletes", "Programs", "Custom_Library"];
  var missing = [];
  required.forEach(function(name) {
    if (!sheetApp.getSheetByName(name)) { missing.push(name); }
  });
  return missing;
}

function getSafeSheetData(sheetApp, sheetName) {
  var sheet = sheetApp.getSheetByName(sheetName);
  if (!sheet) { return []; }
  try {
    return sheet.getDataRange().getValues();
  } catch(err) {
    console.error("Error reading " + sheetName + ": " + err.toString());
    return [];
  }
}

function loadMergedLibrary(sheetApp) {
  var customSheet = sheetApp.getSheetByName("Custom_Library");
  var masterSheet = sheetApp.getSheetByName("Exercise_Library") || sheetApp.getSheetByName("Bunny_Library");
  
  var customRows = [];
  var masterRows = [];
  
  if (customSheet) {
    try {
      var customData = customSheet.getDataRange().getValues();
      if (customData.length > 1) {
        customData.shift();
        for (var i = 0; i < customData.length; i++) {
          customRows.push([customData[i][0], customData[i][1], customData[i][2], customData[i][3], customData[i][4], customData[i][5], customData[i][6]]);
        }
      }
    } catch(e) {}
  }
  
  if (masterSheet) {
    try {
      var masterData = masterSheet.getDataRange().getValues();
      if (masterData.length > 1) {
        masterData.shift();
        for (var j = 0; j < masterData.length; j++) {
          masterRows.push([masterData[j][0], masterData[j][1], masterData[j][2], masterData[j][3], masterData[j][4], masterData[j][5], masterData[j][6]]);
        }
      }
    } catch(e) {}
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
    var masterNameKey = String(masterRows[j][0] || "").trim().toLowerCase();
    if (masterNameKey && !seenNames[masterNameKey]) {
      seenNames[masterNameKey] = true;
      combinedRows.push(masterRows[j]);
    }
  }
  return combinedRows;
}

function parseTimeToSecondsGAS(str) {
  if (!str) return 0;
  var strClean = String(str).toLowerCase();
  var parts = strClean.split('|');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    var colonMatch = p.match(/(\d+):(\d+)/);
    if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    var secMatch = p.match(/(\d+(?:\.\d+)?)\s*s/);
    if (secMatch) return parseFloat(secMatch[1]);
  }
  return 0;
}

function parseDistanceToMetersGAS(str) {
  if (!str) return 0;
  var strClean = String(str).toLowerCase();
  var parts = strClean.split('|');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    var match = p.match(/(\d+(?:\.\d+)?)\s*(m|km)/);
    if (match) {
      var val = parseFloat(match[1]);
      if (match[2] === 'km') val *= 1000;
      return val;
    }
  }
  return 0;
}