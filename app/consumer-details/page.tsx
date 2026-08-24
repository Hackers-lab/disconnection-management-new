'use client';

import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  ShieldCheck, 
  Lock, 
  User, 
  Phone, 
  MapPin, 
  Gauge, 
  CreditCard, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Search, 
  ArrowRight,
  LogOut,
  Calendar,
  IndianRupee,
  Layers,
  Sparkles,
  TrendingUp,
  Activity,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  Building2,
  Clock,
  Eye,
  Receipt,
  Download,
  AlertTriangle,
  ChevronDown,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

interface SessionData {
  username: string;
  token: string;
  offCode: string;
  offName?: string;
  name?: string;
  designation?: string;
}

export default function ConsumerIntelligencePage() {
  // Auth state
  const [session, setSession] = useState<SessionData | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Consumer query state
  const [consumerId, setConsumerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'billing' | 'payments' | 'readings'>('overview');
  const [data, setData] = useState<any>(null);
  const [queryError, setQueryError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showA3Details, setShowA3Details] = useState(false);

  // Direct Bill PDF Viewing State
  const [fetchingBillInvoice, setFetchingBillInvoice] = useState<string | null>(null);
  const [billError, setBillError] = useState<string | null>(null);

  // Load saved session on mount
  useEffect(() => {
    const saved = localStorage.getItem('consumer_portal_session');
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const saveSession = (sess: SessionData | null) => {
    setSession(sess);
    if (sess) {
      localStorage.setItem('consumer_portal_session', JSON.stringify(sess));
    } else {
      localStorage.removeItem('consumer_portal_session');
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Direct PDF Download / View function using captured API
  const handleViewBillPdf = async (invoiceNo: string) => {
    if (!session || !consumerId.trim()) return;
    setFetchingBillInvoice(invoiceNo);
    setBillError(null);

    try {
      const res = await fetch('/api/consumer-details/bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: session.username,
          token: session.token,
          offCode: session.offCode,
          conId: consumerId.trim(),
          invoiceNo: invoiceNo.trim()
        })
      });

      const json = await res.json();
      if (json.success && json.base64) {
        // Convert Base64 string to Blob and open in new browser tab
        const byteCharacters = atob(json.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(blob);
        window.open(fileURL, '_blank');
      } else {
        setBillError(json.error || 'Bill copy not available for this invoice');
      }
    } catch (err: any) {
      setBillError(err.message || 'Failed to load bill PDF');
    } finally {
      setFetchingBillInvoice(null);
    }
  };

  // Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/consumer-details/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_otp', username, password })
      });
      const json = await res.json();
      if (json.code === '200') {
        setOtpSent(true);
      } else {
        setAuthError(json.message || json.error || 'Failed to send OTP');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error');
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: Verify OTP & Login
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/consumer-details/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', username, otp })
      });
      const json = await res.json();
      const payload = Array.isArray(json) ? json[0] : json;

      if (payload?.code === '200' && payload.message?.JWT_token) {
        const sess: SessionData = {
          username,
          token: payload.message.JWT_token,
          offCode: payload.message.off_code,
          offName: payload.message.off_name,
          name: payload.message.name,
          designation: payload.message.designation
        };
        saveSession(sess);
        setOtpSent(false);
        setPassword('');
        setOtp('');
      } else {
        setAuthError(payload?.message || payload?.error || 'Invalid OTP');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error');
    } finally {
      setAuthLoading(false);
    }
  };

  // Query consumer details
  const handleFetchConsumer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!consumerId.trim()) {
      setQueryError('Please enter a 9-digit Consumer ID');
      return;
    }
    if (!session) return;

    setLoading(true);
    setQueryError('');
    try {
      const res = await fetch('/api/consumer-details/consumer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: session.username,
          token: session.token,
          offCode: session.offCode,
          conId: consumerId.trim()
        })
      });
      const json = await res.json();
      if (json.success && json.master) {
        setData(json);
      } else {
        setQueryError(json.error || 'Consumer ID not found or session expired');
        if (json.error?.includes('session') || json.error?.includes('token') || json.error?.includes('401') || json.error?.includes('600')) {
          saveSession(null);
        }
      }
    } catch (err: any) {
      setQueryError(err.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const master = data?.master;
  const payments = data?.payments || [];
  const billing = data?.billing || [];
  const readings = data?.readings || [];
  const osd = data?.osd;

  // Clean data formatting helpers
  const cleanName = master?.ZNAME ? master.ZNAME.replace(/\s*\.\s*$/, '').trim() : '';
  const cleanAddress = master?.ZADDRESS ? master.ZADDRESS.replace(/,\s*$/, '').replace(/\s+,/g, ',').trim() : '';
  const cleanCccName = master?.ZOFF_NAME ? master.ZOFF_NAME.replace(/CUSTOMER CARE CENTRE/i, 'CCC').replace(/CUSTOMER CARE CENTER/i, 'CCC').trim() : (master?.ZOFF_CODE || 'N/A');
  const cleanLoad = master?.ZCONN_LOAD ? `${parseFloat(master.ZCONN_LOAD)} kW` : '';

  // Exact Dues Math Alignment
  const totalGrossDue = osd?.T6?.[0]?.AMT ? parseFloat(osd.T6[0].AMT) : (master?.ZTOT_OSD ? parseFloat(master.ZTOT_OSD) : 0);
  const currentMonthDue = osd?.A1?.[0]?.AMT ? parseFloat(osd.A1[0].AMT) : 0;
  const legacyArrears = osd?.L3?.[0]?.AMT ? parseFloat(osd.L3[0].AMT) : 0;
  const a3List = osd?.A3 || [];
  const a3Sum = a3List.reduce((acc: number, item: any) => acc + (parseFloat(item.AMT) || 0), 0);
  const lpscAmount = osd?.L4?.[0]?.AMT ? parseFloat(osd.L4[0].AMT) : 0;
  const feeAmount = osd?.T5?.[0]?.AMT ? parseFloat(osd.T5[0].AMT) : 0;
  const surchargesTotal = lpscAmount + feeAmount;

  // Disconnection Notice Base OSD (Principal prior to late penalties)
  const disconnectionBaseOsd = (legacyArrears + a3Sum) > 0 ? (legacyArrears + a3Sum) : (totalGrossDue - surchargesTotal - currentMonthDue);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased pb-24 selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 py-3 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link 
              href="/dashboard" 
              className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition-colors"
            >
              <Zap className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900">Consumer Details</h1>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  CONNECTED
                </span>
              </div>
            </div>
          </div>

          {session ? (
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-800">{session.name || session.username}</div>
                <div className="text-[11px] text-slate-500">{session.offName || `Office: ${session.offCode}`}</div>
              </div>
              <button
                onClick={() => saveSession(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Authentication Required
            </span>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-5">
        {/* --- 1. AUTHENTICATION CARD --- */}
        {!session ? (
          <div className="max-w-md mx-auto my-6 p-6 rounded-2xl bg-white border border-slate-200 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Portal Authentication</h2>
              <p className="text-xs text-slate-500 mt-1">Enter your officer credentials to start session</p>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{authError}</span>
              </div>
            )}

            {!otpSent ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Officer ID / Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                    placeholder="Enter ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                    placeholder="Enter Password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Send OTP to Mobile'}
                  {!authLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>OTP dispatched to registered mobile number</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Enter 5-Digit OTP</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    autoFocus
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg tracking-widest font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                    placeholder="•••••"
                  />
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="w-1/3 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-2/3 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* --- 2. MAIN CONSUMER VIEW --- */
          <div className="space-y-4">
            {/* Search Input Bar */}
            <form onSubmit={handleFetchConsumer} className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={consumerId}
                  onChange={(e) => setConsumerId(e.target.value)}
                  placeholder="Enter 9-Digit Consumer ID..."
                  autoFocus
                  className="w-full pl-10 pr-3 py-2.5 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Lookup</span>
              </button>
            </form>

            {/* Error Message */}
            {queryError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-medium flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{queryError}</span>
              </div>
            )}

            {/* Empty State */}
            {!master && !loading && (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-inner">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Query Any Consumer Record</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Type a 9-digit consumer ID above to view live dues, arrears breakdown, billing archive, and payment history.
                </p>
              </div>
            )}

            {/* If Consumer Master Loaded */}
            {master && (
              <div className="space-y-4">
                {/* HERO CARD: CONSUMER OVERVIEW */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button
                          onClick={() => copyToClipboard(master.ZCON_ID?.replace(/^0+/, ''), 'conId')}
                          className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 transition-colors cursor-pointer"
                          title="Click to copy Consumer ID"
                        >
                          <span>{master.ZCON_ID?.replace(/^0+/, '')}</span>
                          {copiedField === 'conId' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-blue-500" />}
                        </button>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                          master.ZCONN_STAT === 'LIVE' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          <Activity className="w-2.5 h-2.5" /> {master.ZCONN_STAT || 'LIVE'}
                        </span>

                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          {master.ZCLASS_DESC || 'DOMESTIC'}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-slate-900 tracking-tight">{cleanName}</h2>
                      <p className="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{cleanAddress}</span>
                      </p>
                    </div>

                    {/* Dual Outstanding Highlights */}
                    <div className="flex flex-col gap-1.5 bg-rose-50/90 border border-rose-200 rounded-xl p-3 sm:text-right min-w-[190px]">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Gross Reconnection Total</div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-rose-700 tracking-tight">
                        ₹{totalGrossDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-rose-700/90 font-semibold pt-1 border-t border-rose-200/60 flex justify-between sm:justify-end gap-2">
                        <span className="text-slate-600">Disconnection OSD:</span>
                        <span className="font-mono font-bold">₹{disconnectionBaseOsd.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Clean Metric Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-blue-600" /> Meter No
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-800 mt-1">{master.ZMET1 || 'N/A'}</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-600" /> Mobile
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-800 mt-1 flex items-center justify-between">
                        <span>{master.ZMOB_NO || 'N/A'}</span>
                        {master.ZMOB_NO && (
                          <a href={`tel:${master.ZMOB_NO}`} className="text-[10px] text-emerald-700 hover:underline">Call</a>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-amber-600" /> Load / Tariff
                      </div>
                      <div className="text-xs font-bold text-slate-800 mt-1 truncate" title={`${cleanLoad} (${master.ZTARIFF || 'A'})`}>
                        {cleanLoad ? `${cleanLoad} (${master.ZTARIFF || 'A'})` : (master.ZTARIFF || 'A')}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-purple-600" /> Office
                      </div>
                      <div className="text-xs font-bold text-slate-800 mt-1 truncate" title={cleanCccName}>
                        {cleanCccName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* TAB SELECTOR BAR */}
                <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTab === 'overview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    OSD & Payments
                  </button>
                  <button
                    onClick={() => setActiveTab('billing')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'billing' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" /> All Bills ({billing.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('payments')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'payments' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Payment History ({payments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('readings')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'readings' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" /> Meter Readings ({readings.length})
                  </button>
                </div>

                {/* --- TAB CONTENT 1: OVERVIEW (OSD MATH + PAYMENTS) --- */}
                {activeTab === 'overview' && (
                  <div className="space-y-3">
                    {/* PERFECTLY BALANCED OSD BREAKDOWN GRID */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Exact Dues Breakdown</h3>
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          Notice Base: <strong className="text-slate-900 font-mono">₹{disconnectionBaseOsd.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        {/* Card 1: Current Month */}
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                          <div className="text-[10px] font-bold uppercase text-slate-500">1. Current Bill (A1)</div>
                          <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">₹{currentMonthDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{osd?.A1?.[0]?.DUE_FROM || 'Current Cycle'}</div>
                        </div>

                        {/* Card 2: Pending Invoices A3 */}
                        <div 
                          onClick={() => setShowA3Details(!showA3Details)}
                          className="p-3 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase text-slate-500">2. Past Cycles (A3)</div>
                            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showA3Details ? 'rotate-180' : ''}`} />
                          </div>
                          <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">₹{a3Sum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-blue-600 font-medium mt-0.5">{a3List.length} Unpaid Cycles (Tap)</div>
                        </div>

                        {/* Card 3: Historical Arrears L3 */}
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                          <div className="text-[10px] font-bold uppercase text-slate-500">3. Legacy Arrears (L3)</div>
                          <div className="text-sm font-bold font-mono text-rose-600 mt-0.5">₹{legacyArrears.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Long-Term Dues</div>
                        </div>

                        {/* Card 4: Surcharges & Fees L4+T5 */}
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                          <div className="text-[10px] font-bold uppercase text-slate-500">4. Surcharges (L4+T5)</div>
                          <div className="text-sm font-bold font-mono text-amber-600 mt-0.5">₹{surchargesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">LPSC + Meter Fee</div>
                        </div>
                      </div>

                      {/* Expandable A3 Detail List */}
                      {showA3Details && a3List.length > 0 && (
                        <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1.5 text-xs animate-in fade-in-50">
                          <div className="text-[11px] font-bold text-blue-900">Unbilled Past Quarter Invoices:</div>
                          {a3List.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between py-1 border-b border-blue-100/50 last:border-0 font-mono text-[11px]">
                              <span className="text-slate-600">Period: {item.DUE_FROM} to {item.DUE_TO} (Inv: {item.INV_NO})</span>
                              <span className="font-bold text-slate-900">₹{item.AMT}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* LATEST PAYMENTS SUMMARY */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-emerald-600" />
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Latest Payment Activity</h3>
                        </div>
                        <button 
                          onClick={() => setActiveTab('payments')} 
                          className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          View All ({payments.length}) <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {payments.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs">No recent payment history found</div>
                      ) : (
                        <div className="space-y-2">
                          {payments.slice(0, 3).map((p: any, idx: number) => (
                            <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  ✓
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-800">{p.MODE_OF_PAYMENT || 'BILL PAYMENT'}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    Doc: {p.CLEAR_DOC_NO || p.REC_NO} • {p.PAYMENT_GATEWAY || 'ONLINE'}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold font-mono text-emerald-600">
                                  ₹{parseFloat(p.PAY_AMOUNT || '0').toLocaleString('en-IN')}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 justify-end">
                                  <Calendar className="w-3 h-3" /> {p.PAY_DATE}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* NETWORK & LOCATION SPECS */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2 text-xs">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Network & Location Specs</div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Feeder Name</span>
                        <span className="text-slate-800 font-medium">{master.ZFEEDER_NM || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">DTR Location / Code</span>
                        <span className="text-slate-800 font-medium">{master.ZDTR_CODE} ({master.ZDTR_LOC})</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Installation No</span>
                        <span className="text-slate-800 font-mono font-medium">{master.ZINST_NO || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">Business Partner (BP)</span>
                        <span className="text-slate-800 font-mono font-medium">{master.ZBP_NO || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- TAB CONTENT 2: ALL BILLS (WITH DIRECT OFFICIAL PDF VIEWER) --- */}
                {activeTab === 'billing' && (
                  <div className="space-y-2.5">
                    {billError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{billError}</span>
                      </div>
                    )}

                    {billing.length === 0 ? (
                      <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-slate-500 text-xs font-medium">
                        No billing records available
                      </div>
                    ) : (
                      billing.map((b: any, idx: number) => {
                        const isFetching = fetchingBillInvoice === b.INV_NO;
                        return (
                          <div key={idx} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">Month: {b.BIL_MM_YY}</span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                  {b.BILL_TYPE || 'POST-PAID'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                                <span>Invoice: <strong className="text-slate-700">{b.INV_NO}</strong></span>
                                <span>• Energy: ₹{b.ENERGY_CH}</span>
                                <span>• Fixed: ₹{b.FXD_DMND_CH}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>Due Date: <strong className="text-slate-700">{b.DUE_DATE}</strong></span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                              <div className="sm:text-right">
                                <div className="text-xs text-slate-500 font-medium">Amount Due</div>
                                <div className="text-base font-bold font-mono text-slate-900">₹{b.AMT_BFR_D_DT}</div>
                                {b.AMT_AFTR_DUE_DT !== b.AMT_BFR_D_DT && (
                                  <div className="text-[10px] text-rose-600 font-medium font-mono">After Due: ₹{b.AMT_AFTR_DUE_DT}</div>
                                )}
                              </div>

                              {/* DIRECT OFFICIAL BILL PDF ACTION */}
                              <button
                                onClick={() => handleViewBillPdf(b.INV_NO)}
                                disabled={isFetching}
                                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                                title="Fetch and view official Bill PDF"
                              >
                                {isFetching ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5" />
                                )}
                                <span>{isFetching ? 'Loading PDF...' : 'View Bill'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* --- TAB CONTENT 3: FULL PAYMENTS LIST --- */}
                {activeTab === 'payments' && (
                  <div className="space-y-2.5">
                    {payments.length === 0 ? (
                      <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-slate-500 text-xs font-medium">
                        No payment history found
                      </div>
                    ) : (
                      payments.map((p: any, idx: number) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900">{p.MODE_OF_PAYMENT || 'BILL PAYMENT'}</div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Doc: {p.CLEAR_DOC_NO || p.REC_NO} • {p.PAYMENT_GATEWAY || 'ONLINE'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold font-mono text-emerald-600">
                              ₹{parseFloat(p.PAY_AMOUNT || '0').toLocaleString('en-IN')}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1 justify-end">
                              <Calendar className="w-3 h-3 text-slate-400" /> {p.PAY_DATE}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* --- TAB CONTENT 4: METER READINGS --- */}
                {activeTab === 'readings' && (
                  <div className="space-y-2.5">
                    {readings.length === 0 ? (
                      <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-slate-500 text-xs font-medium">
                        No reading records found
                      </div>
                    ) : (
                      readings.map((r: any, idx: number) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-900">{r.Acc_Bill_Month} ({r.Reading_Stat})</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Meter: {r.Meter_No} • {r.Prev_Reading} ➔ {r.Curr_Reading} ({r.Reading_Days || '30'} days)
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold font-mono text-blue-700">{r.TOT_UNIT} Units</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{r.Curr_Reading_Dt}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
