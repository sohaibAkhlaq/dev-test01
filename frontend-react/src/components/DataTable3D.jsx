import React, { useState } from 'react';
import { Search, Download, ArrowUpDown, CheckCircle, FileText, FileCode } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function DataTable3D({ classes = [], totalAnnotations = 0, taskId = 1, onSelectClass, selectedClass }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState('count');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter
  const filtered = (classes || []).filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  // Sort
  filtered.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const handleExportCsv = () => {
    let csv = 'Label ID,Class Name,Hex Color,Count,Share of Task\n';
    classes.forEach((c) => {
      const pct = totalAnnotations > 0 ? ((c.count / totalAnnotations) * 100).toFixed(2) : 0;
      csv += `${c.label_id},"${c.name}",${c.color},${c.count},${pct}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cvat_task_${taskId}_annotation_analytics.csv`;
    link.click();

    // Trigger subtle confetti celebration on export!
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.85 } });
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify({ task_id: taskId, total_annotations: totalAnnotations, classes }, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cvat_task_${taskId}_annotation_analytics.json`;
    link.click();
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.85 } });
  };

  return (
    <div className="table-panel-3d">
      <div className="table-header-bar">
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="search-field-tech"
            placeholder="Search classes (e.g. person, car)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-tech btn-tech-outline" onClick={handleExportCsv} title="Export Dataset Counts to CSV">
            <FileText size={15} />
            Export CSV
          </button>
          <button className="btn-tech btn-tech-outline" onClick={handleExportJson} title="Export Full JSON Schema">
            <FileCode size={15} />
            Export JSON
          </button>
        </div>
      </div>

      <div className="table-container-scroll">
        <table className="tech-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>
                Class Name <ArrowUpDown size={12} style={{ display: 'inline', marginLeft: 4 }} />
              </th>
              <th>Hex Color</th>
              <th onClick={() => toggleSort('count')} style={{ cursor: 'pointer' }}>
                Count <ArrowUpDown size={12} style={{ display: 'inline', marginLeft: 4 }} />
              </th>
              <th>Share of Task</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  No classes match your query "{searchTerm}".
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const pct = totalAnnotations > 0 ? ((item.count / totalAnnotations) * 100).toFixed(1) : 0;
                const isSelected = selectedClass === item.name;

                return (
                  <tr
                    key={item.label_id}
                    onClick={() => onSelectClass && onSelectClass(isSelected ? null : item.name)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : undefined,
                    }}
                  >
                    <td>
                      <span className="swatch-glow" style={{ color: item.color, background: item.color }} />
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{item.color}</code>
                    </td>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {item.count.toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          style={{
                            width: 80,
                            height: 6,
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: 9999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: item.color,
                              borderRadius: 9999,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 600,
                          background: item.count > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                          color: item.count > 0 ? 'var(--accent-emerald)' : 'var(--text-dim)',
                        }}
                      >
                        {item.count > 0 ? 'Annotated' : 'Empty'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
