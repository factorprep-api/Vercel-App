export const fetchAthletes = async () => {
  try {
    const { data, error } = await supabase
      .from('athletes')
      .select('name, role, users!inner(email), athlete_team_memberships(active_pods)');
    if (error) return { athletes: [], error: error.message };

    const ATHLETE_SHEET_HEADER = ['Name', 'Role', 'PrimaryClub', 'CoachName', 'C4', 'C5', 'C6', 'C7', 'C8', 'Email', 'C10', 'Active Pods'];
    
    const rows = (data || []).map(a => {
      const row = Array(12).fill('');
      row[0] = a.name || '';
      row[1] = a.role || '';
      row[9] = a.users ? a.users.email : '';
      if (a.athlete_team_memberships && a.athlete_team_memberships.length > 0) {
        row[11] = (a.athlete_team_memberships[0].active_pods || []).join(', ');
      }
      return row;
    });

    return { athletes: [ATHLETE_SHEET_HEADER, ...rows], error: null };
  } catch (error) { return { athletes: [], error: error.message }; }
};
