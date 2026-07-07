import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { getAthleteByEmail, fetchLogbookByAthlete } from './api';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [myHistory, setMyHistory] = useState([]);
  const [athleteName, setAthleteName] = useState('');
  const [maxes, setMaxes] = useState([]);
  const [activeTab, setActiveTab] = useState('maxes');
  const [uniqueExercises, setUniqueExercises] = useState([]);
  const [filterVal, setFilterVal] = useState('All');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const athleteData = await getAthleteByEmail(user.email);

        if (athleteData.status !== 'Success') {
          setErrorMsg('No athlete profile found for: ' + user.email);
          setLoading(false);
          return;
        }

        const name = athleteData.athleteName;
        setAthleteName(name);

        const headers = athleteData.headers || [];
        const rowData = athleteData.rowData || [];
        const parsedMaxes = [];

        for (let c = 1; c < headers.length; c++) {
          let liftName = String(headers[c]).trim();
          if (liftName.toLowerCase() === 'pin') continue;
          if (liftName.toLowerCase() === 'email') continue;
          if (liftName.toLowerCase() === 'program assignment') continue;
          let liftWeight = parseFloat(rowData[c]);
          if (liftName !== '' && !isNaN(liftWeight) && liftWeight > 0) {
            parsedMaxes.push({ name: liftName, weight: liftWeight });
          }
        }
        setMaxes(parsedMaxes);

        const logData = await fetchLogbookByAthlete(name);
        const logbookEntries = logData.data || [];

        if (logbookEntries.length > 0) {
          setMyHistory(logbookEntries);
          const uniqueEx = [...new Set(logbookEntries.map(h => h.ex))].filter(Boolean).sort();
          setUniqueExercises(uniqueEx);
        }

        setLoading(false);
      } catch (err) {
        console.error('Dashboard load error:', err);
        setErrorMsg('Failed to load dashboard data.');
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const filteredHistory = myHistory.filter(h =>
    filterVal === 'All' ? true : h.ex === filterVal
  );

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        fontFamily: 'Roboto Flex, sans-serif'
      }}>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        fontFamily: 'Roboto Flex, sans-serif',
        padding: '20px'
      }}>
        <div style={{
          background: '#fee2e2',
          border: '1px solid #ef4444',
          color: '#dc2626',
          padding: '20px',
          borderRadius: '8px',
          maxWidth: '400px',
          textAlign: 'center'
        }}>
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: 'Roboto Flex, sans-serif',
      padding: '20px',
      backgroundColor: '#f8fafc',
      minHeight: '100vh'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#333' }}>My Progress</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>{athleteName}</p>
        </div>

        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <button
            onClick={() => setActiveTab('maxes')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'maxes' ? '#008ed3' : 'white',
              color: activeTab === 'maxes' ? 'white' : '#666',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Metrics (1RM)
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'history' ? '#008ed3' : 'white',
              color: activeTab === 'history' ? 'white' : '#666',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            History Vault
          </button>
        </div>

        {activeTab === 'maxes' && (
          <div style={{
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{
              background: '#111',
              color: 'white',
              padding: '12px 15px',
              fontWeight: 'bold',
              fontSize: '14px',
              textTransform: 'uppercase'
            }}>Current Core Maxes</div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              padding: '15px 10px'
            }}>
              {maxes.length === 0 ? (
                <p style={{ padding: '15px', color: '#888' }}>No metrics recorded yet.</p>
              ) : (
                maxes.map((m, i) => (
                  <div key={i} style={{
                    width: '50%',
                    boxSizing: 'border-box',
                    padding: '5px'
                  }}>
                    <div style={{
                      background: '#f4f6f8',
                      border: '1px solid #e2e3e5',
                      padding: '15px',
                      borderRadius: '6px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        fontSize: '11px',
                        color: '#555',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}>{m.name}</div>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: '#2e7d32',
                        marginTop: '8px'
                      }}>{m.weight} <span style={{
                        fontSize: '13px',
                        color: '#888'
                      }}>kg</span></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{
            background: 'white',
            border: '1px solid #ddd',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <label style={{
              fontWeight: 'bold',
              fontSize: '13px',
              color: '#555'
            }}>Filter Past Workouts:</label>
            <select
              value={filterVal}
              onChange={(e) => setFilterVal(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '2px solid #eee',
                borderRadius: '4px',
                marginTop: '5px',
                marginBottom: '15px',
                background: '#fdfdfd'
              }}
            >
              <option value="All">All Movements</option>
              {uniqueExercises.map((ex, i) => (
                <option key={i} value={ex}>{ex}</option>
              ))}
            </select>

            <div style={{
              maxHeight: '500px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {filteredHistory.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', marginTop: '20px' }}>No records found.</p>
              ) : (
                filteredHistory.map((item, i) => (
                  <div key={i} style={{
                    background: '#fdfdfd',
                    border: '1px solid #e2e3e5',
                    padding: '12px',
                    borderLeft: '4px solid #008ed3',
                    borderRadius: '6px'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end'
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          {String(item.date).split('T')[0]} | <strong>{item.prog}</strong>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#111', marginTop: '4px' }}>
                          {item.ex}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#111' }}>
                          {item.wt} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>kg</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          x {item.reps} reps
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
