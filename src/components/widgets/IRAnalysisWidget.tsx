'use client';

import React, { useState, useEffect } from 'react';

interface EDINETReport {
  docID: string;
  docDescription: string;
  filerName: string;
  submitDateTime: string;
}

interface Company {
  name: string;
  edinet_code: string;
}

export default function IRAnalysisWidget({ ticker, companyName }: { ticker?: string, companyName?: string }) {
  const [activeTab, setActiveTab] = useState<'edinet' | 'visualize'>('visualize');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reports, setReports] = useState<EDINETReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For visualize tab
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>(companyName || '');
  const [financialData, setFinancialData] = useState<any>(null);
  const [isLoadingFinance, setIsLoadingFinance] = useState(false);

  // 初回マウント時、または ticker が変わったときにデータを取得する
  useEffect(() => {
    if (ticker) {
      // 外部からティッカーが指定された場合は yfinance/quick-summary APIで即座に取得を試みる
      setIsLoadingFinance(true);
      setFinancialData(null);
      fetch(`/api/v1/finance/quick-summary/${encodeURIComponent(ticker)}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setFinancialData(data);
          } else {
            // エラーなら従来のDB検索(summary)にフォールバック
            fetchDBFinancials(ticker, companyName);
          }
        })
        .catch(err => {
          console.error("Quick Summary Failed, trying DB", err);
          fetchDBFinancials(ticker, companyName);
        })
        .finally(() => setIsLoadingFinance(false));
    }
  }, [ticker, companyName]);

  const fetchDBFinancials = (searchTicker: string, searchName?: string) => {
    fetch(`/api/v1/finance/summary/${encodeURIComponent(searchTicker)}?name=${encodeURIComponent(searchName || '')}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setFinancialData(data);
        } else {
          setFinancialData(null);
        }
      })
      .catch(err => {
        console.error("DB Fetch Failed", err);
        setFinancialData(null);
      });
  };

  useEffect(() => {
    // 従来のセレクトボックス用
    fetch('/api/v1/finance/companies')
      .then(res => res.json())
      .then(data => {
        if (data.companies && data.companies.length > 0) {
          setCompanies(data.companies);
          if (!ticker && !selectedCompany) {
            setSelectedCompany(data.companies[0].name);
          }
        }
      })
      .catch(err => console.error("Failed to load companies", err));
  }, []);

  // セレクトボックスで企業が手動変更された場合
  useEffect(() => {
    if (!selectedCompany || ticker) return; // 外部指定されている場合は無視
    setIsLoadingFinance(true);
    fetch(`/api/v1/finance/summary/Unknown?name=${encodeURIComponent(selectedCompany)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setFinancialData(data);
        } else {
          setFinancialData(null);
        }
      })
      .catch(err => {
        console.error("Failed to load financial data", err);
        setFinancialData(null);
      })
      .finally(() => setIsLoadingFinance(false));
  }, [selectedCompany, ticker]);

  const fetchReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/finance/edinet/reports?date=${date}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch reports: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setReports(data.reports || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCSV = (docID: string, docDescription: string) => {
    window.open(`/api/v1/finance/edinet/csv/${docID}`, '_blank');
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "N/A";
    return new Intl.NumberFormat('ja-JP').format(val);
  };

  const renderBar = (label: string, value: number, maxValue: number, color: string) => {
    const percentage = maxValue > 0 ? Math.max(0, Math.min(100, (value / maxValue) * 100)) : 0;
    return (
      <div className="flex flex-col gap-1 w-full mt-2">
        <div className="flex justify-between text-xs text-slate-300">
          <span>{label}</span>
          <span className="font-mono">{formatCurrency(value)} 百万円</span>
        </div>
        <div className="h-4 w-full bg-slate-800 rounded-sm overflow-hidden">
          <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center z-10">
        <h2 className="font-semibold flex items-center gap-2 text-white">
          <span className="text-emerald-400">📄</span> 
          IR & EDINET Analysis
        </h2>
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700/50">
          <button 
            onClick={() => setActiveTab('visualize')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeTab === 'visualize' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            決算可視化
          </button>
          <button 
            onClick={() => setActiveTab('edinet')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeTab === 'edinet' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            大量保有報告書 (DL)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'edinet' ? (
          <div className="p-4 h-full overflow-auto custom-scrollbar">
            <div className="flex gap-2 mb-4 items-center">
              <label className="text-sm font-semibold">提出日:</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
              />
              <button 
                onClick={fetchReports} 
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-sm font-semibold disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : '取得'}
              </button>
            </div>

            {error && (
              <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              {reports.length === 0 && !isLoading && !error && (
                <p className="text-slate-400 text-sm">報告書が見つかりません。日付を変更して取得してください。</p>
              )}
              {reports.map((r, idx) => (
                <div key={idx} className="bg-slate-800 border border-slate-700 rounded p-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-white text-sm">{r.filerName}</p>
                    <p className="text-xs text-slate-400">{r.docDescription}</p>
                    <p className="text-xs text-slate-500 mt-1">提出日時: {r.submitDateTime}</p>
                  </div>
                  <button 
                    onClick={() => handleDownloadCSV(r.docID, r.docDescription)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-xs transition-colors"
                  >
                    CSV DL
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full p-6 overflow-auto custom-scrollbar bg-slate-950">
            {!ticker && (
              <div className="flex items-center gap-4 mb-6">
                <label className="text-sm font-semibold text-slate-300">Choose Company:</label>
                <select 
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 flex-1 max-w-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {companies.length > 0 ? (
                    companies.map((c, i) => <option key={i} value={c.name}>{c.name}</option>)
                  ) : (
                    <option value="">データベースに企業情報がありません</option>
                  )}
                </select>
                {isLoadingFinance && <span className="text-xs text-indigo-400 animate-pulse">Loading...</span>}
              </div>
            )}

            {isLoadingFinance && ticker && !financialData && (
              <div className="flex-1 flex flex-col items-center justify-center text-indigo-400 gap-4 animate-pulse">
                <span className="text-4xl">📊</span>
                <p className="text-sm">財務データを取得・計算しています...</p>
              </div>
            )}

            {financialData ? (
              <div className="flex flex-col gap-6 animate-in fade-in duration-500">
                <div className="border-b border-slate-800 pb-4">
                  <h1 className="text-3xl font-bold text-white mb-2">{financialData.company_name}</h1>
                  <h3 className="text-lg text-slate-400">{financialData.period_name}</h3>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-400 mb-1">売上高利益率</span>
                    <span className="text-2xl font-mono text-emerald-400">
                      {financialData.net_profit_rate !== null ? `${financialData.net_profit_rate.toFixed(2)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-400 mb-1">営業利益率</span>
                    <span className="text-2xl font-mono text-blue-400">
                      {financialData.operation_profit_rate !== null ? `${financialData.operation_profit_rate.toFixed(2)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-400 mb-1">経常利益率</span>
                    <span className="text-2xl font-mono text-indigo-400">
                      {financialData.ordinary_profit_rate !== null ? `${financialData.ordinary_profit_rate.toFixed(2)}%` : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl mt-4">
                  <h4 className="text-sm font-semibold text-slate-300 mb-6 flex items-center gap-2">
                    <span>📊</span> 業績サマリー (百万円)
                  </h4>
                  <div className="space-y-4">
                    {renderBar("売上高", financialData.net_sales || 0, financialData.net_sales || 1, "bg-slate-400")}
                    {renderBar("営業利益", financialData.operating_income || 0, financialData.net_sales || 1, "bg-blue-500")}
                    {renderBar("経常利益", financialData.ordinary_income || 0, financialData.net_sales || 1, "bg-indigo-500")}
                    {renderBar("純利益", financialData.net_income || 0, financialData.net_sales || 1, "bg-emerald-500")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                <span className="text-3xl opacity-50">📂</span>
                <p>
                  {!isLoadingFinance && companies.length > 0 ? "データが取得できませんでした。" : "企業を選択するか、AI分析から企業を特定してください。"}
                </p>
                {!ticker && companies.length === 0 && (
                  <p className="text-xs text-slate-600 max-w-sm text-center mt-2">
                    ※DBに企業が登録されていません。<br/>EDINET API経由でバッチ(`import_financial_data.py`)を実行するか、左側のData Analyzerから企業を特定してください。
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}