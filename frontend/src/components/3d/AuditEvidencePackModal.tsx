import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Download, ShieldCheck, Key, Calendar,
  CheckCircle2, RefreshCw, Layers, ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';

interface AuditEvidencePackModalProps {
  isOpen: boolean;
  onClose: () => void;
  packType?: string; // Exception, Customer, PeriodAudit
  targetId?: string;
}

export const AuditEvidencePackModal: React.FC<AuditEvidencePackModalProps> = ({
  isOpen,
  onClose,
  packType = 'PeriodAudit',
  targetId
}) => {
  const [period, setPeriod] = useState('2026-10');
  const [selectedType, setSelectedType] = useState(packType);
  const [generating, setGenerating] = useState(false);
  const [currentPack, setCurrentPack] = useState<any | null>(null);
  const [packList, setPackList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadPacks();
      handleGenerate();
    }
  }, [isOpen, packType, targetId]);

  const loadPacks = async () => {
    try {
      const list = await api.getEvidencePacks();
      setPackList(list);
    } catch (err) {
      console.error('Failed to load packs', err);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const pack = await api.generateEvidencePack(selectedType, targetId, period);
      setCurrentPack(pack);
      await loadPacks();
    } catch (err) {
      console.error('Failed to generate pack', err);
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const fin = currentPack?.financial_summary || {};

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl h-[88vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <ShieldCheck className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Automated Audit Evidence Pack
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    Cryptographic Compliance Dossier
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Generates non-repudiable audit manifests with SHA-256 seal, PDF reports, and Excel workbooks
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Ribbon */}
          <div className="px-6 py-3.5 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Scope:</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              >
                <option value="PeriodAudit">Monthly Period Audit</option>
                <option value="Customer">Customer Account Dossier</option>
                <option value="Exception">Exception Specific Lineage</option>
              </select>

              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              >
                <option value="2026-10">October 2026 (2026-10)</option>
                <option value="2026-09">September 2026 (2026-09)</option>
                <option value="2026-08">August 2026 (2026-08)</option>
              </select>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3.5 py-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                <span>{generating ? 'Compiling Dossier...' : 'Generate New Pack'}</span>
              </button>
            </div>

            {/* Download Buttons */}
            {currentPack && (
              <div className="flex items-center gap-2">
                <a
                  href={api.downloadEvidencePackPdfUrl(currentPack.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-rose-400" />
                  <span>Download Audit PDF</span>
                </a>
                <a
                  href={api.downloadEvidencePackXlsxUrl(currentPack.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download XLSX Workbook</span>
                </a>
              </div>
            )}
          </div>

          {/* Dossier Preview Canvas */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {currentPack ? (
              <>
                {/* Dossier Stamp Banner */}
                <div className="bg-slate-950/70 border border-teal-500/40 rounded-xl p-4 flex items-center justify-between shadow-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white tracking-wide">{currentPack.target_name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono font-medium">
                        {currentPack.pack_code}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                      <Key className="w-3.5 h-3.5 text-teal-400" />
                      <span>SHA-256 Checksum: <b className="text-slate-300">{currentPack.manifest_checksum}</b></span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Bound Records</span>
                    <span className="text-base font-bold text-teal-400 font-mono">
                      {currentPack.source_reference_count} Records
                    </span>
                  </div>
                </div>

                {/* Financial Overview Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Invoiced Baseline</span>
                    <div className="text-lg font-bold text-white mt-1">
                      ₹{fin.invoiced_amount?.toLocaleString() || '0'}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Audit Certified Receivable</span>
                    <div className="text-lg font-bold text-teal-400 mt-1">
                      ₹{fin.expected_amount?.toLocaleString() || '0'}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Net Identified Variance</span>
                    <div className="text-lg font-bold text-rose-400 mt-1">
                      ₹{fin.variance_amount?.toLocaleString() || '0'}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Recovery Status</span>
                    <div className="text-xs font-semibold text-emerald-400 mt-1 truncate">
                      {fin.recovery_potential || 'Verified'}
                    </div>
                  </div>
                </div>

                {/* Sections Dossier Accordion */}
                <div className="space-y-4">
                  {currentPack.sections?.map((sec: any, idx: number) => (
                    <div key={idx} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow">
                      <h4 className="font-semibold text-xs text-white uppercase tracking-wider mb-2">
                        {sec.section_name}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed mb-3">
                        {sec.content}
                      </p>

                      {sec.key_metrics && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
                          {sec.key_metrics.map((m: any, mIdx: number) => (
                            <div key={mIdx} className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                              <span className="text-[10px] text-slate-400 block">{m.label}</span>
                              <span className="text-xs font-semibold text-slate-200 mt-0.5 block truncate">
                                {m.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <FileText className="w-12 h-12 text-slate-600 mb-2" />
                <span>Compiling evidence pack...</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
