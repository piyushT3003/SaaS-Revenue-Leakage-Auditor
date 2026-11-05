import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Building, FileText, AlertTriangle, Layers, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

interface SearchResult {
  category: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query);
        setResults(res.results || []);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (results.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % (results.length || 1));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigateTo(results[selectedIndex].route);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const navigateTo = (route: string) => {
    navigate(route);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: -15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-2xl bg-[#0d1629] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.15)] z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800">
          <Search className="w-5 h-5 text-cyan-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search customers, contracts, invoices, exceptions..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-slate-400 hover:text-white mr-2">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-800 rounded border border-slate-700">ESC</kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {loading && (
            <div className="py-8 text-center text-slate-400 text-sm">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Searching database...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-sm">
              No matching records found for "{query}". Try searching by customer name, INV number, or EXC code.
            </div>
          )}

          {!loading && !query && (
            <div className="py-6 px-4 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Quick Suggestions</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => setQuery('TechNova')} className="text-left px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-between border border-slate-700/50">
                  <span>TechNova Pvt. Ltd.</span>
                  <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                </button>
                <button onClick={() => setQuery('Underbilling')} className="text-left px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-between border border-slate-700/50">
                  <span>Underbilling Exceptions</span>
                  <ArrowRight className="w-3.5 h-3.5 text-rose-400" />
                </button>
                <button onClick={() => setQuery('INV-202610')} className="text-left px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-between border border-slate-700/50">
                  <span>October Invoices</span>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                </button>
                <button onClick={() => setQuery('CloudCore')} className="text-left px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-between border border-slate-700/50">
                  <span>CloudCore Solutions</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>
            </div>
          )}

          {results.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={`${item.category}-${item.id}-${idx}`}
                onClick={() => navigateTo(item.route)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 text-white'
                    : 'text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className={`p-2 rounded-lg mr-3 ${
                  item.category === 'Customer' ? 'bg-cyan-500/10 text-cyan-400' :
                  item.category === 'Invoice' ? 'bg-blue-500/10 text-blue-400' :
                  item.category === 'Exception' ? 'bg-rose-500/10 text-rose-400' :
                  'bg-amber-500/10 text-amber-400'
                }`}>
                  {item.category === 'Customer' && <Building className="w-4 h-4" />}
                  {item.category === 'Invoice' && <FileText className="w-4 h-4" />}
                  {item.category === 'Exception' && <AlertTriangle className="w-4 h-4" />}
                  {item.category === 'Contract' && <Layers className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm truncate">{item.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                </div>
                <ArrowRight className={`w-4 h-4 ml-2 transition-transform ${isSelected ? 'text-cyan-400 translate-x-1' : 'text-slate-600'}`} />
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
      )}
    </AnimatePresence>
  );
};
