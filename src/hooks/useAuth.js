import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { getAthleteByEmail } from '../api';

/**
 * Custom hook to centralize authentication and role detection
 * Returns: { isAuthenticated, isLoading, role, athleteData, userEmail, athleteName }
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [athleteData, setAthleteData] = useState(null);
  const [athleteName, setAthleteName] = useState('');

  // Fetch role from sheets and cache in localStorage
  async function fetchRoleFromSheets(email) {
    try {
      const result = await getAthleteByEmail(email);
      if (result.status === 'Success') {
        const cached = {
          name: result.athleteName,
          email,
          role: result.role,
          rowIndex: result.rowIndex,
          headers: result.headers,
          rowData: result.rowData
        };
        localStorage.setItem('fp_athlete_data', JSON.stringify(cached));
        setRole(result.role);
        setAthleteData(cached);
        setAthleteName(result.athleteName || email.split('@')[0]);
        return result;
      } else {
        // Default to athlete if not found
        const cached = { name: email.split('@')[0], email, role: 'athlete', rowIndex: null, headers: [], rowData: [] };
        localStorage.setItem('fp_athlete_data', JSON.stringify(cached));
        setRole('athlete');
        setAthleteData(cached);
        setAthleteName(email.split('@')[0]);
        return null;
      }
    } catch (e) {
      console.error('Role fetch failed:', e);
      setRole('athlete');
      setAthleteData({ name: email.split('@')[0], email, role: 'athlete' });
      setAthleteName(email.split('@')[0]);
      return null;
    }
  }

  useEffect(() => {
    // Restore from localStorage cache
    const cached = localStorage.getItem('fp_athlete_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.role) setRole(parsed.role);
        if (parsed.name) setAthleteName(parsed.name);
        if (parsed.rowData) setAthleteData(parsed);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      setAthleteName('');
      setAthleteData(null);
      setIsLoading(false);
      return;
    }

    const determineRole = async () => {
      setIsLoading(true);
      
      // Try cache first if email matches
      const cached = localStorage.getItem('fp_athlete_data');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.email === session.user.email && parsed.role) {
            setRole(parsed.role);
            setAthleteName(parsed.name || session.user.email.split('@')[0]);
            setAthleteData(parsed);
            setIsLoading(false);
            // Refresh in background
            fetchRoleFromSheets(session.user.email);
            return;
          }
        } catch {}
      }

      // No valid cache - fetch from sheets
      await fetchRoleFromSheets(session.user.email);
      setIsLoading(false);
    };

    determineRole();
  }, [session]);

  // Subscribe to auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        localStorage.removeItem('fp_athlete_data');
        setRole(null);
        setAthleteName('');
        setAthleteData(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Computed values
  const isAuthenticated = useMemo(() => !!session, [session]);
  const userEmail = useMemo(() => session?.user?.email || null, [session]);

  return {
    isAuthenticated,
    isLoading,
    role,
    athleteData,
    athleteName,
    userEmail,
    session
  };
}
