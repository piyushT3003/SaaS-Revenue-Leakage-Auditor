import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, GitBranch, Search, ShieldCheck, AlertTriangle, Layers,
  ChevronRight, ArrowRight, ExternalLink, Download, Sparkles, Filter
} from 'lucide-react';
import { api } from '../../services/api';

interface RevenueEvidenceGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId?: string;
  exceptionId?: string;
  invoiceId?: string;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  details: Record<string, any>;
  is_discrepancy: boolean;
  severity: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  explanation: string;
  is_divergent: boolean;
}

export const RevenueEvidenceGraphModal: React.FC<RevenueEvidenceGraphModalProps> = ({
  isOpen,
  onClose,
  customerId,
  exceptionId,
  invoiceId
}) => {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; financial_trace: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');

  useEffect(() => {
    if (isOpen) {
      loadGraph();
    }
  }, [isOpen, customerId, exceptionId]);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const data = await api.getEvidenceGraph(customerId, exceptionId);
      setGraphData(data);
      if (data.nodes && data.nodes.length > 0) {
        // Default select discrepancy node if exists, else first node
        const disc = data.nodes.find((n: GraphNode) => n.is_discrepancy);
        setSelectedNode(disc || data.nodes[0]);
      }
    } catch (err) {
      console.error('Failed to load evidence graph', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredNodes = graphData?.nodes.filter(n => {
    const matchesSearch = n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          n.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'All' || n.type === filterType;
    return matchesSearch && matchesFilter;
  }) || [];

  const nodeTypes = ['All', ...Array.from(new Set(graphData?.nodes.map(n => n.type) || []))];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-6xl h-[88vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
          style={{
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.9), 0 0 40px rgba(59, 130, 246, 0.15)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <GitBranch className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Revenue Evidence Graph
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Deterministic Financial Lineage
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Tracing contract terms through meter telemetry to invoiced receivables & variance root cause
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Trace Progress Trail */}
          {graphData?.financial_trace && (
            <div className="px-6 py-2 bg-slate-950/40 border-b border-slate-800/80 overflow-x-auto flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium whitespace-nowrap">Lineage Trail:</span>
              {graphData.financial_trace.map((step, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/60 border border-slate-700/60 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span className="text-slate-200 font-medium">{step.step}</span>
                  </div>
                  {idx < graphData.financial_trace.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Main Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: 3D Node Grid & Spatial View */}
            <div className="flex-1 p-6 flex flex-col overflow-hidden border-r border-slate-800 bg-slate-950/20">
              {/* Controls */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search financial nodes, invoices, meters..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {nodeTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                        filterType === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Node Cards Canvas */}
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 lg:grid-cols-3 gap-3.5 auto-rows-max">
                  {filteredNodes.map(node => {
                    const isSelected = selectedNode?.id === node.id;
                    return (
                      <motion.div
                        key={node.id}
                        whileHover={{ y: -4, scale: 1.02 }}
                        onClick={() => setSelectedNode(node)}
                        className={`cursor-pointer p-4 rounded-xl border transition-all relative overflow-hidden backdrop-blur-sm ${
                          node.is_discrepancy
                            ? isSelected
                              ? 'bg-rose-950/60 border-rose-500 shadow-lg shadow-rose-900/30 ring-1 ring-rose-500'
                              : 'bg-rose-950/30 border-rose-700/60 hover:border-rose-500'
                            : isSelected
                            ? 'bg-blue-950/50 border-blue-500 shadow-lg shadow-blue-900/30 ring-1 ring-blue-500'
                            : 'bg-slate-800/50 border-slate-700/70 hover:border-slate-500'
                        }`}
                        style={{
                          transform: isSelected ? 'translateZ(10px)' : 'none'
                        }}
                      >
                        {/* Glow indicator */}
                        {node.is_discrepancy && (
                          <div className="absolute top-0 right-0 w-12 h-12 bg-rose-500/20 blur-xl rounded-full pointer-events-none" />
                        )}

                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            node.is_discrepancy
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-slate-700/60 text-slate-300'
                          }`}>
                            {node.type}
                          </span>
                          {node.is_discrepancy ? (
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          )}
                        </div>

                        <div className="font-medium text-sm text-white truncate mb-1">
                          {node.label}
                        </div>

                        <div className="text-xs text-slate-400 flex items-center justify-between">
                          <span>Verified Entity</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Record Inspector Side Panel */}
            <div className="w-80 md:w-96 p-6 flex flex-col overflow-y-auto bg-slate-900/90">
              {selectedNode ? (
                <div>
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-xs font-semibold uppercase text-blue-400">Node Record Detail</span>
                      <h3 className="text-base font-bold text-white mt-0.5">{selectedNode.label}</h3>
                    </div>
                    {selectedNode.is_discrepancy && (
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        Discrepancy Root
                      </span>
                    )}
                  </div>

                  {/* Attributes list */}
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Immutable Attributes
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                      {Object.entries(selectedNode.details).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-slate-200 font-medium font-mono text-right max-w-[60%] truncate">
                            {typeof val === 'number' && key.includes('amount') || key.includes('fee') || key.includes('charge')
                              ? `₹${val.toLocaleString()}`
                              : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Inbound & Outbound Connections */}
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider pt-2">
                      Connected Relationships
                    </div>
                    <div className="space-y-2">
                      {graphData?.edges
                        .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                        .map(edge => {
                          const isSource = edge.source === selectedNode.id;
                          return (
                            <div
                              key={edge.id}
                              className={`p-3 rounded-lg border text-xs ${
                                edge.is_divergent
                                  ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                                  : 'bg-slate-800/40 border-slate-700/60 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-semibold mb-1">
                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-700/60">
                                  {isSource ? 'Target' : 'Source'}
                                </span>
                                <span>{edge.relation}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                {edge.explanation}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                  <Layers className="w-8 h-8 text-slate-600 mb-2" />
                  <span>Select any node on the graph to inspect cryptographic foreign key records</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
