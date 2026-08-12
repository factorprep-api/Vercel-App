  async function loadData() {
    const cached = localStorage.getItem('fp_library_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setProgramData(parsed.programs || []);
        setAthletesData(parsed.athletes || []);
        setLoading(false);
        refreshData(); 
        return;
      } catch {}
    }

    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      try {
        // FIX: Replaced fetchAllData with two targeted, lightning-fast pipes!
        const [progRes, athRes] = await Promise.all([
          fetchPrograms(),
          fetchAthletes()
        ]);
        
        if (progRes.error) throw new Error(progRes.error); 
        
        setProgramData(progRes.programs || []);
        setAthletesData(athRes.athletes || []);
        setLoading(false);
        setError(null);
        success = true;
        
        localStorage.setItem('fp_library_data', JSON.stringify({
          programs: progRes.programs || [],
          athletes: athRes.athletes || [],
          timestamp: Date.now()
        }));
      } catch (err) {
        attempts++;
        if (attempts >= 3) {
          setError('Database connection is weak right now. Please refresh the page.');
          setLoading(false);
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  async function refreshData() {
    try {
      // FIX: Also updated the background refresh to use the fast pipes
      const [progRes, athRes] = await Promise.all([
        fetchPrograms(),
        fetchAthletes()
      ]);
      
      if (!progRes.error && !athRes.error) {
        setProgramData(progRes.programs || []);
        setAthletesData(athRes.athletes || []);
        localStorage.setItem('fp_library_data', JSON.stringify({
          programs: progRes.programs || [],
          athletes: athRes.athletes || [],
          timestamp: Date.now()
        }));
      }
    } catch {} 
  }


