import React, { useState, useEffect, useRef } from 'react';
import {
  Sun,
  Moon,
  Layers,
  Database,
  Activity,
  Zap,
  PlusCircle,
  MinusCircle,
  Wifi,
  WifiOff,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  Box,
} from 'lucide-react';

import SpatialVisualizer3D from './components/SpatialVisualizer3D';
import ParticleField3D from './components/ParticleField3D';
import KpiCard3D from './components/KpiCard3D';
import Chart3D from './components/Chart3D';
import DataTable3D from './components/DataTable3D';

// User Authentication Test Directory
const USERS = {
  annotator_lead: { user: 'annotator_lead', pass: 'pass123', label: 'User: Task Owner (200 OK)' },
  admin: { user: 'admin', pass: 'admin123', label: 'User: Superuser Admin (200 OK)' },
  unauthorized_guest: { user: 'unauthorized_guest', pass: 'pass123', label: 'User: Unauthorized Guest (403 Forbidden)' },
  anonymous: { user: '', pass: '', label: 'User: Anonymous (401 Unauthorized)' },
};

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('cvat_theme') || 'dark');
  const [taskId, setTaskId] = useState(1);
  const [currentUser, setCurrentUser] = useState('annotator_lead');
  const [shapeFilter, setShapeFilter] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);

  // Analytics API Data
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [latency, setLatency] = useState(12.4);

  // WebSocket Live Stream & Resilience (Requirements 8 & 9)
  const [wsStatus, setWsStatus] = useState('online'); // 'online' | 'reconnecting' | 'offline'
  const [wsStatusText, setWsStatusText] = useState('Live Stream');
  const [simulatedDrop, setSimulatedDrop] = useState(false);
  const [toast, setToast] = useState(null);

  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  // Theme Sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cvat_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // REST API Fetcher
  const fetchAnalytics = async (tid = taskId, filter = shapeFilter, userKey = currentUser) => {
    setLoading(true);
    setError(null);
    const startTime = performance.now();

    let url = `http://127.0.0.1:8000/api/v1/tasks/${tid}/annotations/analytics`;
    if (filter) url += `?shape_type=${encodeURIComponent(filter)}`;

    const headers = { Accept: 'application/json' };
    const creds = USERS[userKey];
    if (creds && creds.user) {
      headers['Authorization'] = 'Basic ' + btoa(`${creds.user}:${creds.pass}`);
    }

    try {
      const resp = await fetch(url, { headers });
      const elapsed = (performance.now() - startTime).toFixed(1);
      setLatency(elapsed);

      if (resp.status === 401) {
        setError({
          status: '401 Unauthorized',
          message: 'Authentication credentials were not provided. Select "Task Owner" from the User menu to authenticate.',
        });
        setLoading(false);
        return;
      }
      if (resp.status === 403) {
        setError({
          status: '403 Forbidden',
          message: 'Permission denied. Current user has no access rights to this CVAT task.',
        });
        setLoading(false);
        return;
      }
      if (resp.status === 404) {
        setError({
          status: '404 Not Found',
          message: `Task ID #${tid} was not found in the CVAT database.`,
        });
        setLoading(false);
        return;
      }
      if (!resp.ok) {
        setError({
          status: `HTTP ${resp.status}`,
          message: `Server returned an error: ${resp.statusText}`,
        });
        setLoading(false);
        return;
      }

      const data = await resp.json();
      setAnalytics(data);
      setLoading(false);
    } catch (err) {
      setError({
        status: 'Connection Error',
        message: 'Could not connect to Django API backend at http://127.0.0.1:8000. Ensure server is active.',
      });
      setLoading(false);
    }
  };

  // Trigger fetch on parameter changes
  useEffect(() => {
    fetchAnalytics(taskId, shapeFilter, currentUser);
  }, [taskId, shapeFilter, currentUser]);

  // WebSocket Live Updates (Requirement 8 & 9)
  const connectWebSocket = (tid) => {
    if (simulatedDrop) return;

    setWsStatus('reconnecting');
    setWsStatusText('Connecting...');

    try {
      const ws = new WebSocket(`ws://127.0.0.1:8001/ws/tasks/${tid}/annotations/`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setWsStatus('online');
        setWsStatusText('Live Stream');
      };

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.analytics) {
            setAnalytics(payload.analytics);
            if (payload.type === 'annotation_created') {
              showToast(`Live update: [${payload.details?.label || 'shape'}] added to task!`, 'success');
            } else if (payload.type === 'annotation_deleted') {
              showToast(`Live update: Annotation removed.`, 'warning');
            }
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onclose = () => {
        if (!simulatedDrop) {
          setWsStatus('reconnecting');
          setWsStatusText(`Reconnecting (${reconnectAttemptsRef.current + 1})...`);
          scheduleWsReconnect(tid);
        } else {
          setWsStatus('offline');
          setWsStatusText('Simulated Disconnect');
        }
      };

      ws.onerror = () => {
        setWsStatus('reconnecting');
        setWsStatusText('Connection error');
      };
    } catch (err) {
      scheduleWsReconnect(tid);
    }
  };

  const scheduleWsReconnect = (tid) => {
    if (simulatedDrop) return;
    if (reconnectAttemptsRef.current >= 8) {
      setWsStatus('offline');
      setWsStatusText('Stream Offline');
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 12000);
    reconnectAttemptsRef.current++;
    clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket(tid);
    }, delay);
  };

  useEffect(() => {
    connectWebSocket(taskId);
    return () => {
      if (wsRef.current) wsRef.current.close();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [taskId]);

  // Live Simulation Trigger Actions
  const handleSimulateAdd = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const classes = analytics?.classes || [];
      const sample = classes.length > 0 ? classes[Math.floor(Math.random() * classes.length)].name : 'person';
      wsRef.current.send(JSON.stringify({ action: 'simulate_annotation', label_name: sample }));
    } else {
      showToast('WebSocket not connected', 'warning');
    }
  };

  const handleSimulateDelete = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'simulate_delete' }));
    } else {
      showToast('WebSocket not connected', 'warning');
    }
  };

  const toggleDropSimulation = () => {
    if (!simulatedDrop) {
      setSimulatedDrop(true);
      if (wsRef.current) wsRef.current.close();
      setWsStatus('offline');
      setWsStatusText('Simulated Disconnect');
      showToast('Simulated connection drop. Reconnect circuit engaged.', 'warning');
    } else {
      setSimulatedDrop(false);
      showToast('Restoring connection...', 'success');
      connectWebSocket(taskId);
      fetchAnalytics(taskId, shapeFilter, currentUser);
    }
  };

  const activeClassesCount = (analytics?.classes || []).filter((c) => c.count > 0).length;
  const primaryGeometry = analytics?.geometry_breakdown?.[0]?.type?.toUpperCase() || 'RECTANGLE';

  return (
    <div className="app-wrapper">
      {/* 3D Dynamic Particle Background */}
      <ParticleField3D theme={theme} />

      {/* Navigation Header */}
      <header className="header-glass">
        <div className="brand-wrapper">
          <div className="brand-badge-3d">CV</div>
          <div className="brand-info">
            <h1>
              CVAT Annotation Analytics 3D
              <span className="pill-version">React • Three.js</span>
            </h1>
            <p className="brand-subtitle">
              High-performance perception intelligence with live WebSockets & spatial cuboids
            </p>
          </div>
        </div>

        <div className="header-actions">
          {/* WebSocket Status Indicator */}
          <div className={`status-pill-3d ${wsStatus}`} title="WebSocket Live Stream Status">
            <span className="status-dot-3d" />
            <span>{wsStatusText}</span>
          </div>

          {/* Task Selector */}
          <select
            className="select-tech"
            value={taskId}
            onChange={(e) => setTaskId(parseInt(e.target.value))}
            title="Switch CVAT Task"
          >
            <option value="1">Task #1: COCO 2017 Val (Object Detection)</option>
            <option value="2">Task #2: Empty Video Stream (0 Annotations)</option>
            <option value="3">Task #3: Urban Drone Aerial Survey 4K</option>
          </select>

          {/* User Role Switcher for Auth Verification (Requirement 5) */}
          <select
            className="select-tech"
            value={currentUser}
            onChange={(e) => setCurrentUser(e.target.value)}
            title="Switch User Role to test access control"
          >
            <option value="annotator_lead">{USERS.annotator_lead.label}</option>
            <option value="admin">{USERS.admin.label}</option>
            <option value="unauthorized_guest">{USERS.unauthorized_guest.label}</option>
            <option value="anonymous">{USERS.anonymous.label}</option>
          </select>

          {/* Dark / Light Mode Toggle */}
          <button className="btn-icon-round" onClick={toggleTheme} title="Toggle Dark/Light Mode">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* 3D Tilt KPI Summary Row */}
      <section className="kpi-row-3d">
        <KpiCard3D
          title="Total Annotations"
          value={analytics?.total_annotations?.toLocaleString() || '0'}
          subtitle="Indexed shapes in database"
          icon={Layers}
          color="#6366f1"
        />
        <KpiCard3D
          title="Active Classes"
          value={`${activeClassesCount} / ${(analytics?.classes || []).length}`}
          subtitle="Represented in current taxonomy"
          icon={Box}
          color="#06b6d4"
        />
        <KpiCard3D
          title="Primary Geometry"
          value={primaryGeometry}
          subtitle="Dominant spatial type"
          icon={Database}
          color="#10b981"
        />
        <KpiCard3D
          title="API Response Speed"
          value={`${latency} ms`}
          subtitle="SQL GROUP BY latency (Target <= 30ms)"
          icon={Zap}
          color="#f59e0b"
        />
      </section>

      {/* Control Strip: Filter Geometry & Live Action Triggers */}
      <section className="toolbar-strip">
        <div className="filter-pills-wrap">
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>
            Filter Shape:
          </span>
          {['', 'rectangle', 'polygon', 'points', 'polyline'].map((filterVal) => (
            <button
              key={filterVal}
              className={`pill-btn ${shapeFilter === filterVal ? 'active' : ''}`}
              onClick={() => setShapeFilter(filterVal)}
            >
              {filterVal ? filterVal.charAt(0).toUpperCase() + filterVal.slice(1) : 'All Shapes'}
            </button>
          ))}
        </div>

        <div className="actions-group">
          {/* WebSocket Live Simulation Triggers (Requirement 8) */}
          <button className="btn-tech btn-tech-primary" onClick={handleSimulateAdd} title="Emit live annotation creation event">
            <PlusCircle size={15} />
            + Add Shape (Live WS)
          </button>
          <button className="btn-tech btn-tech-outline" onClick={handleSimulateDelete} title="Emit live annotation deletion event">
            <MinusCircle size={15} />
            − Delete Shape (Live WS)
          </button>
          {/* Drop & Recovery Simulation (Requirement 9) */}
          <button
            className={`btn-tech ${simulatedDrop ? 'btn-tech-primary' : 'btn-tech-outline'}`}
            onClick={toggleDropSimulation}
            title="Simulate dropping WebSocket connection"
          >
            {simulatedDrop ? <Wifi size={15} /> : <WifiOff size={15} />}
            {simulatedDrop ? 'Restore Connection' : 'Simulate Drop'}
          </button>
        </div>
      </section>

      {/* Main Body: Either Error, Empty, or Full 3D Dashboard */}
      {error ? (
        <section className="state-card-clean error">
          <AlertTriangle size={48} style={{ color: 'var(--accent-rose)', margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--accent-rose)' }}>
            {error.status}
          </h2>
          <p style={{ maxWidth: 500, margin: '0 auto 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {error.message}
          </p>
          <button className="btn-tech btn-tech-outline" onClick={() => fetchAnalytics(taskId, shapeFilter, currentUser)}>
            <RefreshCw size={15} />
            Retry Request
          </button>
        </section>
      ) : analytics?.total_annotations === 0 ? (
        <section className="state-card-clean">
          <FolderOpen size={48} style={{ color: 'var(--accent-primary)', margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            No Annotations in this Task
          </h2>
          <p style={{ maxWidth: 500, margin: '0 auto 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            This task currently has zero annotated shapes in the database. Click "+ Add Shape (Live WS)" to simulate incoming annotator activity.
          </p>
          <button className="btn-tech btn-tech-primary" onClick={handleSimulateAdd}>
            <PlusCircle size={15} />
            Simulate Sample Annotation
          </button>
        </section>
      ) : (
        <main>
          {/* Spatial 3D Grid: Three.js Viewport on Left, Dynamic 3D Chart on Right */}
          <section className="spatial-grid-main">
            <div className="panel-3d">
              <div className="panel-header-flex">
                <h2 className="panel-heading">
                  <Box size={20} style={{ color: 'var(--accent-cyan)' }} />
                  3D Spatial Cuboid Visualizer
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interactive Orbit & Perspective</span>
              </div>
              <div style={{ flex: 1, minHeight: 380 }}>
                <SpatialVisualizer3D
                  classes={analytics?.classes}
                  totalAnnotations={analytics?.total_annotations}
                  selectedClass={selectedClass}
                />
              </div>
            </div>

            <Chart3D
              classes={analytics?.classes}
              totalAnnotations={analytics?.total_annotations}
              selectedClass={selectedClass}
              onSelectClass={setSelectedClass}
            />
          </section>

          {/* Interactive Data Table with Sorting and CSV/JSON Export */}
          <DataTable3D
            classes={analytics?.classes}
            totalAnnotations={analytics?.total_annotations}
            taskId={taskId}
            selectedClass={selectedClass}
            onSelectClass={setSelectedClass}
          />
        </main>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            padding: '0.85rem 1.25rem',
            background: 'var(--bg-surface)',
            border: `1px solid ${toast.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
            borderRadius: '12px',
            boxShadow: 'var(--shadow-3d)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.85rem',
            zIndex: 100,
            animation: 'fadeIn 0.25s ease',
          }}
        >
          <span style={{ color: toast.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
            ●
          </span>
          <div>{toast.message}</div>
        </div>
      )}
    </div>
  );
}
