import React, { useState, useEffect } from 'react';
import {
  UploadCloud, FileText, Database, CheckCircle2, AlertTriangle, RefreshCw,
  RotateCcw, Download, ArrowRight, ShieldCheck, Layers, Filter, Check, X,
  Trash2, HelpCircle
} from 'lucide-react';
import { api } from '../../services/api';

export const DataManagementPage: React.FC = () => {
  const [sources, setSources] = useState<any[]>([]);
  const [quality, setQuality] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload & Validation state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dataType, setDataType] = useState('Usage');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Column mapping state
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    customer_code: 'customer_code',
    event_type: 'event_type',
    quantity: 'quantity',
    unit_of_measure: 'unit_of_measure',
    timestamp: 'timestamp'
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [srcRes, qualRes, batchRes] = await Promise.all([
        api.getDataSources(),
        api.getDataQuality(),
        api.getBatches()
      ]);
      setSources(srcRes.sources || []);
      setQuality(qualRes);
      setBatches(batchRes.batches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setValidationResult(null);
      setImportSuccessMessage(null);
    }
  };

  const handleValidateUpload = async () => {
    if (!selectedFile) return;
    setValidating(true);
    setImportSuccessMessage(null);
    try {
      const res = await api.validateUpload(selectedFile, dataType);
      setValidationResult(res);
    } catch (err: any) {
      alert(err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!validationResult?.batch_id) return;
    setImporting(true);
    try {
      const res = await api.confirmImport(validationResult.batch_id);
      setImportSuccessMessage(`Successfully committed batch ${validationResult.batch_id} (${validationResult.accepted_count} rows imported into production).`);
      setValidationResult(null);
      setSelectedFile(null);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Import confirmation failed');
    } finally {
      setImporting(false);
    }
  };

  const handleRollback = async (batchId: string) => {
    if (!window.confirm(`Are you sure you want to rollback batch ${batchId}? This will remove all associated imported records.`)) {
      return;
    }
    setRollingBackId(batchId);
    try {
      await api.rollbackBatch(batchId);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Rollback failed');
    } finally {
      setRollingBackId(null);
    }
  };

  if (loading && !sources.length) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-80 bg-slate-800/60 rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
          ))}
        </div>
        <div className="h-64 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Data Management &amp;</span>
            <span className="text-cyan-400">Ingestion</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Self-serve dataset ingestion, schema validation, CSV/XLSX mapping, and transactional rollback
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href={api.getSampleCsvUrl()}
            download="sample_usage_telemetry.csv"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 hover:bg-cyan-900/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Sample CSV</span>
          </a>
        </div>
      </div>

      {/* TOP ROW: DATA PIPELINE HEALTH & QUALITY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {sources.map((src) => (
          <div key={src.id} className="glass-panel p-4 rounded-2xl border border-slate-800 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400">{src.type}</span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{src.status}</span>
              </span>
            </div>
            <div className="mt-2.5">
              <h3 className="text-xs font-bold text-white truncate">{src.name}</h3>
              <div className="text-lg font-bold text-white tracking-tight mt-1">
                {src.records_count?.toLocaleString()} <span className="text-xs font-normal text-slate-400">records</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Synced: {src.last_sync}</div>
            </div>
          </div>
        ))}
      </div>

      {/* DATA QUALITY ACCORDION BAR */}
      {quality && (
        <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 bg-slate-900/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm">
                {quality.overall_score}%
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center space-x-2">
                  <span>Data Quality &amp; Referential Integrity Score</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/50 px-2 py-0.2 rounded border border-emerald-800/50">Optimal</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Evaluated {quality.total_records.toLocaleString()} records across 5 integrity rules. {quality.valid_records.toLocaleString()} valid, {quality.invalid_records} exceptions flagged.
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {quality.rules_evaluated?.map((rule: any, idx: number) => (
                <div key={idx} className="hidden lg:flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px]">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="text-slate-300 truncate max-w-[120px]">{rule.rule}</span>
                  <span className="text-cyan-400 font-semibold">{rule.passed_pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT SUCCESS NOTIFICATION */}
      {importSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{importSuccessMessage}</span>
        </div>
      )}

      {/* SECTION 2: FILE UPLOAD, SCHEMA MAPPING, & PREVIEW */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <h2 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <UploadCloud className="w-4 h-4 text-cyan-400" />
          <span>Self-Serve Dataset Upload &amp; Schema Mapper</span>
        </h2>
        <p className="text-xs text-slate-400 mb-5">
          Upload telemetry, contract addendums, or manual billing adjustments in CSV or Excel format
        </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Dropzone & Type Selector */}
          <div className="md:col-span-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Target Data Model</label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Usage">Usage Telemetry Events</option>
                <option value="Contracts">Contract Addendums &amp; Schedules</option>
                <option value="Invoices">Invoice Adjustments &amp; Line Items</option>
              </select>
            </div>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-900/30 relative">
              <input
                type="file"
                accept=".csv, .xlsx"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <UploadCloud className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
              <div className="text-xs font-semibold text-white">
                {selectedFile ? selectedFile.name : 'Click or drag CSV or XLSX file here'}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Supports up to 50MB files'}
              </p>
            </div>

            <button
              onClick={handleValidateUpload}
              disabled={!selectedFile || validating}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
            >
              {validating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating Constraints &amp; Schema...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Run Pre-Import Validation</span>
                </>
              )}
            </button>
          </div>

          {/* Interactive Column Mapper */}
          <div className="md:col-span-7 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h3 className="text-xs font-bold text-white mb-2 flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target Schema Column Mapping</span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Verify detected input headers align with relational database columns
            </p>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2">
                <div>Source File Header</div>
                <div>Database Attribute</div>
              </div>

              {[
                { source: 'customer_code', target: 'Customer Code (Unique Key)', type: 'VARCHAR(64)' },
                { source: 'event_type', target: 'Event / Metric Type', type: 'VARCHAR(128)' },
                { source: 'quantity', target: 'Quantity / Units (Decimal)', type: 'NUMERIC(14,4)' },
                { source: 'unit_of_measure', target: 'Unit of Measure', type: 'VARCHAR(32)' },
                { source: 'timestamp', target: 'Event Timestamp (ISO-8601)', type: 'TIMESTAMP' }
              ].map((mapItem, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 items-center p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="font-mono text-cyan-400 font-semibold truncate">{mapItem.source}</div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="truncate">{mapItem.target}</span>
                    <span className="text-[9px] font-mono text-slate-500">{mapItem.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* VALIDATION PREVIEW (WHEN ACTIVE) */}
        {validationResult && (
          <div className="mt-6 pt-6 border-t border-slate-800 animate-in fade-in space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                  <span>Pre-Import Validation Results</span>
                  <span className="text-[10px] font-mono text-slate-400">({validationResult.batch_id})</span>
                </h3>
                <div className="flex items-center space-x-3 mt-1 text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{validationResult.accepted_count} Accepted Rows</span>
                  </span>
                  <span className="text-rose-400 font-semibold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{validationResult.rejected_count} Rejected Rows</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setValidationResult(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing || validationResult.accepted_count === 0}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center space-x-1.5"
                >
                  {importing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Committing Transaction...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Commit {validationResult.accepted_count} Valid Records</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Preview of Accepted vs Rejected rows */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Accepted Preview */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-emerald-900/40">
                <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Valid Rows Sample</span>
                </div>
                {validationResult.preview_accepted.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {validationResult.preview_accepted.map((row: any, idx: number) => (
                      <div key={idx} className="text-[11px] p-2 rounded bg-slate-950 border border-slate-800 font-mono text-slate-300">
                        Row #{row.row_number}: {JSON.stringify(row.data)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No valid records in this batch.</p>
                )}
              </div>

              {/* Rejected Preview */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-rose-900/40">
                <div className="text-xs font-semibold text-rose-400 mb-2 flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Rejected Rows &amp; Validation Errors</span>
                </div>
                {validationResult.preview_rejected.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {validationResult.preview_rejected.map((row: any, idx: number) => (
                      <div key={idx} className="text-[11px] p-2 rounded bg-slate-950 border border-rose-950/60 text-slate-300">
                        <div className="font-semibold text-rose-400">Row #{row.row_number} Rejected:</div>
                        <ul className="list-disc list-inside text-rose-300 text-[10px] mt-0.5">
                          {row.reasons.map((r: string, rIdx: number) => (
                            <li key={rIdx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-400">Clean dataset! Zero constraint violations found.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: INGESTION BATCH HISTORY & ROLLBACK AUDIT */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span>Ingestion Batch History &amp; Transaction Rollback</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Immutable log of uploaded batches with one-click atomic rollback protection
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">Filename</th>
                <th className="py-2.5 px-3">Data Model</th>
                <th className="py-2.5 px-3">Total Rows</th>
                <th className="py-2.5 px-3">Valid / Rejected</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Uploaded At</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-semibold text-white">{b.batch_id}</td>
                  <td className="py-2.5 px-3 text-slate-300 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="truncate max-w-[160px]">{b.filename}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{b.data_type}</td>
                  <td className="py-2.5 px-3 font-semibold text-white">{b.total_rows}</td>
                  <td className="py-2.5 px-3">
                    <span className="text-emerald-400 font-medium">{b.accepted_rows}</span>
                    <span className="text-slate-500"> / </span>
                    <span className="text-rose-400 font-medium">{b.rejected_rows}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      b.status === 'Imported' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' :
                      b.status === 'Rolled Back' ? 'bg-slate-800 text-slate-400 border border-slate-700' :
                      'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40'
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-slate-400">{b.uploaded_at?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="py-2.5 px-3 text-right">
                    {b.status === 'Imported' ? (
                      <button
                        onClick={() => handleRollback(b.batch_id)}
                        disabled={rollingBackId === b.batch_id}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-900 border border-rose-800/50 transition-colors"
                      >
                        {rollingBackId === b.batch_id ? 'Rolling back...' : 'Rollback Batch'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-600 font-mono">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
