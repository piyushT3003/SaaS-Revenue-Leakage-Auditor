import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Send, Database, ShieldCheck, Download, Trash2,
  ChevronDown, ChevronUp, ArrowRight, ExternalLink, RefreshCw,
  TrendingUp, Users, FileText, AlertTriangle, HelpCircle, Layers,
  PieChart as PieChartIcon, BarChart3, CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend
} from 'recharts';
import { api } from '../../services/api';
import { AIQueryResponse } from '../../types';
import { AIHologramIndicator, AIState } from '../../components/3d/AIHologramIndicator';
import { PageTransition } from '../../components/3d/PageTransition';
import { MagneticButton } from '../../components/3d/MagneticButton';

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  question?: string;
  response?: AIQueryResponse;
}

export const AIAssistantPage: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<Array<{ question: string; category: string; icon: string }>>([]);
  const [expandedCalculations, setExpandedCalculations] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getAIState = (): AIState => {
    if (loading) return 'processing';
    if (isResponding) return 'responding';
    if (inputQuestion.trim().length > 0) return 'listening';
    return 'idle';
  };

  const aiState = getAIState();

  useEffect(() => {
    // Fetch suggested questions
    const loadSuggestions = async () => {
      try {
        const res = await api.getSuggestedQuestions();
        setSuggestedQuestions(res);
      } catch (err) {
        console.error(err);
      }
    };
    loadSuggestions();

    // Default welcome prompt demonstration
    const initialQuery = async () => {
      setLoading(true);
      try {
        const defaultQ = "Why did revenue leakage increase this month?";
        const res = await api.askAI(defaultQ);
        setMessages([
          {
            id: 'init-1',
            sender: 'user',
            question: defaultQ,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          },
          {
            id: 'init-2',
            sender: 'assistant',
            response: res,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setExpandedCalculations({ 'init-2': true });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    initialQuery();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText || inputQuestion).trim();
    if (!q || loading) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `ai-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        question: q,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setInputQuestion('');
    setLoading(true);

    try {
      const res = await api.askAI(q);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          sender: 'assistant',
          response: res,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setExpandedCalculations((prev) => ({ ...prev, [assistantMsgId]: true }));
      setIsResponding(true);
      setTimeout(() => setIsResponding(false), 3500);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          sender: 'assistant',
          response: {
            answer: `Audit Query Failed: ${err.message || 'Unable to retrieve records from the database.'}`,
            reporting_period: 'Current Period',
            supporting_metrics: {},
            explanation: 'Check query parameter constraints and database connection settings.',
            affected_customers: [],
            issue_distribution: [],
            source_references: ['database connection'],
            suggested_followups: ['Why is revenue leakage up this month?'],
            is_llm_powered: false,
            status_note: 'Query evaluation returned an error.'
          },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async (question: string) => {
    try {
      const res = await api.exportAIReport(question);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI_Audit_Investigation_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const toggleCalculation = (id: string) => {
    setExpandedCalculations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatCurrency = (val: number) => {
    return '₹' + Math.round(val).toLocaleString('en-IN');
  };

  const chartColors = ['#00f0ff', '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <PageTransition className="flex flex-col h-[calc(100vh-5.5rem)] space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>AI Investigation</span>
            <span className="text-cyan-400">Assistant</span>
            <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full flex items-center space-x-1">
              <Database className="w-3 h-3 text-cyan-400" />
              <span>Database Grounded</span>
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Query financial, contract, invoice, and unit economics records with zero hallucination guarantee
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* 3D Holographic AI Status Monitor */}
          <div className="flex items-center space-x-2 px-3 py-1 rounded-xl bg-slate-900/80 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <AIHologramIndicator state={aiState} size={28} />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold leading-none">Neural Core</span>
              <span className={`text-[10px] font-bold capitalize leading-tight ${
                aiState === 'processing' ? 'text-purple-400 animate-pulse' :
                aiState === 'listening' ? 'text-emerald-400' :
                aiState === 'responding' ? 'text-cyan-400' : 'text-slate-300'
              }`}>{aiState}</span>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to clear the current conversation view?")) {
                  setMessages([]);
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Chat Stream Container */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="flex flex-col items-center justify-center">
              <AIHologramIndicator state={aiState} size={100} />
              <div className="mt-3 px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                AI Engine State: {aiState}
              </div>
            </div>
            <div className="max-w-md">
              <h2 className="text-lg font-bold text-white">How can I assist your financial investigation?</h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Ask any question regarding contract variances, customer billing discrepancies, unit economics, or collection exposure.
                Every response is grounded in deterministic relational database calculations.
              </p>
            </div>

            {/* Quick Suggestion Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full text-left mt-4">
              {suggestedQuestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(s.question)}
                  className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/30 text-xs text-slate-300 transition-all flex items-start space-x-2.5 group"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                  <div>
                    <div className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">{s.category}</div>
                    <div className="text-white mt-0.5 font-medium">{s.question}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.sender === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-xl bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border border-cyan-500/30 p-3.5 rounded-2xl rounded-tr-sm text-xs text-white shadow-sm">
                    <p className="font-medium text-sm text-cyan-100">{msg.question}</p>
                    <span className="text-[10px] text-cyan-400/80 mt-1 block text-right font-mono">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }

            const res = msg.response;
            if (!res) return null;

            const isCalcOpen = expandedCalculations[msg.id] ?? false;

            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-3xl w-full glass-panel p-5 rounded-2xl rounded-tl-sm border border-slate-700/60 space-y-4">
                  {/* Top Response Metadata */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white">Financial Audit Response</span>
                      <span className="text-[10px] text-slate-400 font-mono">({res.reporting_period})</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        res.is_llm_powered
                          ? 'bg-purple-950/40 text-purple-300 border-purple-800/40'
                          : 'bg-cyan-950/40 text-cyan-400 border-cyan-800/40'
                      }`}>
                        {res.status_note || (res.is_llm_powered ? 'Gemini 1.5 Pro' : 'Database Grounded')}
                      </span>

                      <button
                        onClick={() => handleExportReport(msg.question || 'Audit Report')}
                        title="Export this investigation"
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Primary Grounded Answer Text */}
                  <div className="text-xs text-slate-200 leading-relaxed font-normal bg-slate-900/40 p-3 rounded-xl border border-slate-800/60">
                    {res.answer}
                  </div>

                  {/* Supporting Metrics Bar */}
                  {res.supporting_metrics && Object.keys(res.supporting_metrics).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {Object.entries(res.supporting_metrics).map(([key, val], idx) => (
                        <div key={idx} className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium truncate">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm font-bold text-white mt-0.5 block truncate">
                            {typeof val === 'number' && val > 1000 ? formatCurrency(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Visual Chart if Returned */}
                  {res.chart_config && res.chart_config.data && res.chart_config.data.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                      <div className="text-xs font-bold text-white mb-2 flex items-center space-x-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{res.chart_config.title}</span>
                      </div>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={res.chart_config.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <XAxis dataKey="type" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <YAxis
                              stroke="#64748b"
                              tick={{ fill: '#94a3b8', fontSize: 10 }}
                              tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                borderColor: 'rgba(51, 65, 85, 0.8)',
                                borderRadius: '10px',
                                fontSize: '11px',
                                color: '#fff'
                              }}
                              formatter={(val: any) => [formatCurrency(Number(val)), 'Exposure']}
                            />
                            <Bar dataKey="financial_impact" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Affected Accounts Drill-down */}
                  {res.affected_customers && res.affected_customers.length > 0 && (
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                      <div className="text-xs font-semibold text-white mb-2 flex items-center space-x-1.5">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span>High-Impact Affected Accounts</span>
                      </div>
                      <div className="space-y-1.5">
                        {res.affected_customers.map((cust, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
                            <span className="font-medium text-slate-200">
                              {cust.name} {cust.code && <span className="text-[10px] text-slate-400 font-mono">({cust.code})</span>}
                            </span>
                            <div className="flex items-center space-x-2">
                              {cust.impact && (
                                <span className="font-bold text-rose-400">{formatCurrency(cust.impact)}</span>
                              )}
                              {cust.reason && (
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                  {cust.reason}
                                </span>
                              )}
                              <button
                                onClick={() => navigate(`/customers?search=${encodeURIComponent(cust.name)}`)}
                                className="btn-3d px-2 py-0.5 rounded-md bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/50 text-[10px] text-cyan-300 font-medium flex items-center space-x-1"
                              >
                                <span>Account</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                              <button
                                onClick={() => navigate(`/exceptions?search=${encodeURIComponent(cust.name)}`)}
                                className="btn-3d px-2 py-0.5 rounded-md bg-rose-950/80 hover:bg-rose-900 border border-rose-700/50 text-[10px] text-rose-300 font-medium flex items-center space-x-1"
                              >
                                <span>Exceptions</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Expandable Calculation & Audit Formula */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleCalculation(msg.id)}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-900/70 hover:bg-slate-800/60 transition-colors"
                    >
                      <span className="flex items-center space-x-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Calculation Logic & Source Audit Verification</span>
                      </span>
                      {isCalcOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isCalcOpen && (
                      <div className="p-3 bg-slate-950/60 text-xs space-y-2 border-t border-slate-800">
                        <div className="text-slate-300">{res.explanation}</div>
                        <div className="pt-2 border-t border-slate-800/80">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Verified Grounding Sources:</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {res.source_references.map((src, idx) => (
                              <span key={idx} className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/40 px-2 py-0.5 rounded">
                                {src}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Suggested Follow-up Questions */}
                  {res.suggested_followups && res.suggested_followups.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1.5">Suggested Inquiries:</span>
                      <div className="flex flex-wrap gap-2">
                        {res.suggested_followups.map((followup, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(followup)}
                            className="text-[11px] font-medium text-slate-300 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 px-2.5 py-1 rounded-lg transition-all text-left"
                          >
                            {followup}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="glass-panel p-4 rounded-2xl border border-cyan-500/30 flex items-center space-x-3 text-xs text-cyan-300">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Querying relational records, applying financial formulas, and verifying reconciliation proofs...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips (above input bar) */}
      <div className="flex items-center space-x-2 overflow-x-auto py-1 flex-shrink-0 text-xs no-scrollbar">
        <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider whitespace-nowrap">Suggested:</span>
        {suggestedQuestions.slice(0, 4).map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(s.question)}
            className="whitespace-nowrap px-2.5 py-1 rounded-lg text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-[11px] transition-all"
          >
            {s.question}
          </button>
        ))}
      </div>

      {/* Fixed Bottom Prompt Input */}
      <div className="relative flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            placeholder="Ask anything about billing leakage, contracts, customer unit economics, or anomalies..."
            className="w-full bg-slate-900/90 border border-slate-700/80 focus:border-cyan-500 rounded-2xl pl-4 pr-24 py-3 text-xs text-white placeholder-slate-500 focus:outline-none shadow-[0_0_20px_rgba(0,240,255,0.08)] transition-all"
          />
          <MagneticButton
            type="submit"
            disabled={!inputQuestion.trim() || loading}
            className="absolute right-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center space-x-1 shadow-sm"
          >
            <span>Ask</span>
            <Send className="w-3 h-3" />
          </MagneticButton>
        </form>
      </div>
    </PageTransition>
  );
};
