'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Zap, ShieldAlert, Loader2, Search, Menu, MoreHorizontal,
    Link2, Database, Code2, FileText, LayoutGrid, Play,
    CheckCircle2, Circle, XCircle, ArrowRight, X,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

const API_KEY = process.env.NEXT_PUBLIC_GFORCE_API_KEY ?? ''
const AUTH: HeadersInit = API_KEY ? { 'x-gforce-key': API_KEY } : {}

function authFetch(url: string, init?: RequestInit) {
    return fetch(url, { ...init, headers: { ...AUTH, ...(init?.headers ?? {}) } })
}

interface SessionResult {
    id: string; name: string; prompt: string
    category: 'links' | 'data' | 'code' | 'documents' | 'video'
    data: any; error?: string; truncated?: boolean; createdAt: number
}
interface ActivityStep { label: string; status: 'pending' | 'active' | 'done' | 'error' }
interface AuditSite { site: string; status: 'pass' | 'fail' }

const CATEGORIES = [
    { id: 'all',       label: 'All',   icon: LayoutGrid, gradient: 'from-pink-500 to-rose-500'     },
    { id: 'links',     label: 'Links', icon: Link2,      gradient: 'from-cyan-400 to-teal-500'     },
    { id: 'data',      label: 'Data',  icon: Database,   gradient: 'from-violet-500 to-purple-600' },
    { id: 'code',      label: 'Code',  icon: Code2,      gradient: 'from-blue-500 to-blue-700'     },
    { id: 'documents', label: 'Docs',  icon: FileText,   gradient: 'from-orange-400 to-orange-600' },
    { id: 'video',     label: 'Video', icon: Play,       gradient: 'from-green-400 to-emerald-500' },
]

function categorize(data: any): SessionResult['category'] {
    if (!data) return 'data'
    const str = typeof data === 'string' ? data : JSON.stringify(data)
    if (/youtube\.com|vimeo\.com|\.mp4|\.webm/i.test(str)) return 'video'
    if (/https?:\/\//.test(str)) return 'links'
    if (typeof data === 'string' && str.length > 500 && !str.trimStart().startsWith('{') && !str.trimStart().startsWith('[')) return 'documents'
    return 'data'
}

const SUGGESTIONS = [
    'Scrape top 10 Hacker News titles and scores',
    'Get top 5 results from GitHub trending',
    'Extract all links from news.ycombinator.com',
]

function Badge({ status }: { status: ActivityStep['status'] }) {
    const map = {
        done:    { bg: 'bg-emerald-50 text-emerald-600', label: 'Done'    },
        active:  { bg: 'bg-blue-50 text-blue-500',       label: 'Running' },
        pending: { bg: 'bg-gray-100 text-gray-400',      label: 'Waiting' },
        error:   { bg: 'bg-red-50 text-red-500',         label: 'Failed'  },
    }
    const { bg, label } = map[status]
    return <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${bg}`}>{label}</span>
}

export default function GForce() {
    const [prompt, setPrompt] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [activeTask, setActiveTask] = useState<string | null>(null)
    const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([])
    const [results, setResults] = useState<SessionResult[]>([])
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [selectedResult, setSelectedResult] = useState<SessionResult | null>(null)
    const [poolStats, setPoolStats] = useState({ inUse: 0, idle: 0 })
    const [isAuditing, setIsAuditing] = useState(false)

    const promptRef = useRef<HTMLInputElement>(null)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    useEffect(() => {
        promptRef.current?.focus()
        const poll = async () => {
            try {
                const res = await authFetch('/api/pool/stats')
                if (res.ok) {
                    const d = await res.json()
                    setPoolStats({ inUse: d.inUse ?? 0, idle: d.idle ?? 0 })
                }
            } catch { }
        }
        poll()
        const id = setInterval(poll, 3000)
        return () => clearInterval(id)
    }, [])

    function clearTimers() {
        timers.current.forEach(clearTimeout)
        timers.current = []
    }

    const handleRun = async () => {
        const intent = prompt.trim()
        if (!intent || isRunning || isAuditing) return
        setPrompt('')
        setIsRunning(true)
        setActiveTask(intent)
        setSelectedResult(null)
        setActivitySteps([
            { label: 'Analyzing prompt',            status: 'active'  },
            { label: 'Generating automation skill', status: 'pending' },
            { label: 'Running in browser',          status: 'pending' },
        ])
        clearTimers()
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            { ...s[0], status: 'done' }, { ...s[1], status: 'active' }, s[2],
        ]), 2000))
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            s[0], { ...s[1], status: 'done' }, { ...s[2], status: 'active' },
        ]), 5000))

        try {
            const res = await authFetch('/api/forge-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent }),
            })
            const data = await res.json()
            clearTimers()

            if (data.success) {
                setActivitySteps([
                    { label: 'Analyzing prompt',            status: 'done' },
                    { label: 'Generating automation skill', status: 'done' },
                    { label: 'Running in browser',          status: 'done' },
                ])
                const result: SessionResult = {
                    id: `${data.skill.id}-${Date.now()}`,
                    name: data.skill.name,
                    prompt: intent,
                    category: categorize(data.result),
                    data: data.result,
                    truncated: Boolean(data.truncated),
                    createdAt: Date.now(),
                }
                setResults(prev => [result, ...prev])
                setSelectedResult(result)
                toast.success(data.skill.name)
            } else {
                setActivitySteps(prev => prev.map(s =>
                    s.status !== 'done' ? { ...s, status: 'error' as const } : s
                ))
                const errorResult: SessionResult = {
                    id: `err-${Date.now()}`,
                    name: 'Task Failed',
                    prompt: intent,
                    category: 'data',
                    data: null,
                    error: `[${data.stage ?? 'error'}] ${data.error}`,
                    createdAt: Date.now(),
                }
                setResults(prev => [errorResult, ...prev])
                setSelectedResult(errorResult)
                toast.error('Task failed')
            }
        } catch (err) {
            clearTimers()
            setActivitySteps(prev => prev.map(s =>
                s.status !== 'done' ? { ...s, status: 'error' as const } : s
            ))
            toast.error((err as Error).message)
        } finally {
            setIsRunning(false)
        }
    }

    const runAudit = async () => {
        if (isAuditing || isRunning) return
        setIsAuditing(true)
        setActiveTask('Stealth Fingerprint Audit')
        setSelectedResult(null)
        setActivitySteps([
            { label: 'SannySoft fingerprint test', status: 'active'  },
            { label: 'BrowserScan analysis',       status: 'pending' },
            { label: 'CreepJS evaluation',         status: 'pending' },
        ])
        clearTimers()
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            { ...s[0], status: 'done' }, { ...s[1], status: 'active' }, s[2],
        ]), 25000))
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            s[0], { ...s[1], status: 'done' }, { ...s[2], status: 'active' },
        ]), 55000))

        try {
            const res = await authFetch('/api/audit/run', { method: 'POST' })
            const data = await res.json()
            clearTimers()
            if (!data.success) throw new Error(data.error ?? 'Audit failed')
            setActivitySteps(data.results.map((r: AuditSite) => ({
                label: r.site,
                status: (r.status === 'pass' ? 'done' : 'error') as ActivityStep['status'],
            })))
            const passed = data.results.filter((r: AuditSite) => r.status === 'pass').length
            passed === data.results.length
                ? toast.success(`Stealth: ${passed}/${data.results.length} clean`)
                : toast.warning(`Stealth: ${passed}/${data.results.length} passed`)
        } catch (err) {
            clearTimers()
            setActivitySteps(prev => prev.map(s =>
                s.status !== 'done' ? { ...s, status: 'error' as const } : s
            ))
            toast.error('Audit failed')
        } finally {
            setIsAuditing(false)
        }
    }

    const filteredResults = selectedCategory === 'all'
        ? results
        : results.filter(r => r.category === selectedCategory)

    const counts = Object.fromEntries(
        CATEGORIES.map(c => [c.id, c.id === 'all' ? results.length : results.filter(r => r.category === c.id).length])
    )

    const busy = isRunning || isAuditing
    const hasActivity = activitySteps.length > 0
    const todaySteps = activitySteps.filter(s => s.status !== 'pending')
    const upcomingSteps = activitySteps.filter(s => s.status === 'pending')

    return (
        <div className="h-screen flex overflow-hidden font-sans">
            <Toaster position="top-right" theme="dark" richColors />

            {/* ══ LEFT PANEL ══ */}
            <div className="w-[300px] shrink-0 bg-[#1e2240] flex flex-col overflow-hidden p-6 gap-5">

                {/* Top bar */}
                <div className="flex items-center justify-between">
                    <Menu className="h-5 w-5 text-[#4a5080] cursor-pointer hover:text-white transition-colors" />
                    <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[9px] font-bold tracking-widest text-emerald-400 uppercase">Online</span>
                    </div>
                </div>

                {/* Greeting */}
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-5 w-5 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                        <h1 className="text-2xl font-bold text-white">G-Force</h1>
                    </div>
                    <p className="text-[12px] text-[#4a5080] leading-relaxed">Your autonomous automation engine.</p>
                </div>

                {/* Prompt input */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4a5080]" />
                    <input
                        ref={promptRef}
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleRun()}
                        disabled={busy}
                        placeholder="What do you want to automate?"
                        className="w-full bg-[#252844] rounded-2xl pl-10 pr-12 py-3 text-sm text-white placeholder:text-[#4a5080] focus:outline-none disabled:opacity-50 transition-all"
                    />
                    <button
                        onClick={handleRun}
                        disabled={busy || !prompt.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                        {isRunning
                            ? <Loader2 className="h-3.5 w-3.5 text-black animate-spin" />
                            : <ArrowRight className="h-3.5 w-3.5 text-black" />
                        }
                    </button>
                </div>

                {/* Category label */}
                <div>
                    <p className="text-[11px] font-semibold text-[#4a5080] mb-3">Saved · {results.length}</p>

                    {/* Icon grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {CATEGORIES.map(cat => {
                            const isSelected = selectedCategory === cat.id
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className="flex flex-col items-center gap-1.5 group"
                                >
                                    <div className={`relative h-[68px] w-[68px] rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center transition-all ${
                                        isSelected
                                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1e2240] shadow-xl'
                                            : 'opacity-75 hover:opacity-100'
                                    }`}>
                                        <cat.icon className="h-6 w-6 text-white" />
                                        {isSelected && (
                                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-white shadow" />
                                        )}
                                    </div>
                                    <span className="text-[10px] text-[#4a5080] group-hover:text-[#8a90b8] transition-colors">{cat.label}</span>
                                    <span className="text-xs font-bold text-white leading-none -mt-1">{counts[cat.id]}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Result items */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
                    {filteredResults.length === 0 ? (
                        <p className="text-[10px] text-[#2e3356] text-center py-4 uppercase tracking-widest font-bold">
                            {results.length === 0 ? 'No results yet' : 'Empty category'}
                        </p>
                    ) : filteredResults.map(r => {
                        const cat = CATEGORIES.find(c => c.id === r.category) ?? CATEGORIES[0]
                        return (
                            <button
                                key={r.id}
                                onClick={() => setSelectedResult(r)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                                    selectedResult?.id === r.id ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-[#8a90b8]'
                                }`}
                            >
                                <div className={`h-6 w-6 rounded-lg bg-gradient-to-br ${r.error ? 'from-red-500 to-red-600' : cat.gradient} flex items-center justify-center shrink-0`}>
                                    {r.error ? <XCircle className="h-3 w-3 text-white" /> : <cat.icon className="h-3 w-3 text-white" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-semibold truncate">{r.name}</div>
                                    <div className="text-[9px] opacity-50 truncate mt-0.5">{r.prompt}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
                    <span className="text-[9px] text-[#2e3356] font-mono">{poolStats.inUse} active · {poolStats.idle} idle</span>
                    <button
                        onClick={runAudit}
                        disabled={busy}
                        className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#2e3356] hover:text-[#8a90b8] disabled:opacity-40 transition-colors"
                    >
                        {isAuditing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ShieldAlert className="h-2.5 w-2.5" />}
                        Audit
                    </button>
                </div>
            </div>

            {/* ══ RIGHT PANEL ══ */}
            <div className="flex-1 bg-white flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-8 pt-8 pb-5">
                    <h2 className="text-2xl font-bold text-gray-900 truncate leading-tight">
                        {activeTask ?? 'Command Center'}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {isRunning    ? 'Working on it...' :
                         isAuditing   ? 'Running stealth audit...' :
                         hasActivity && activitySteps.some(s => s.status === 'error') ? 'Task failed' :
                         hasActivity  ? 'Completed successfully' :
                         'Type a prompt on the left to begin'}
                    </p>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-8 pb-8">
                    {!hasActivity && !selectedResult ? (

                        /* Idle */
                        <div className="flex flex-col items-start gap-2 pt-2">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Try these</p>
                            {SUGGESTIONS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => { setPrompt(s); promptRef.current?.focus() }}
                                    className="w-full max-w-md flex items-center justify-between px-4 py-3.5 rounded-2xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all text-left group"
                                >
                                    <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{s}</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 ml-3" />
                                </button>
                            ))}
                        </div>

                    ) : (
                        <div className="space-y-7 max-w-xl">

                            {/* Today — active/done/error steps */}
                            {todaySteps.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-semibold text-gray-800">Today</h3>
                                        <MoreHorizontal className="h-4 w-4 text-gray-300" />
                                    </div>
                                    <div className="space-y-3.5">
                                        {todaySteps.map((step, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                                                    {step.status === 'done' && (
                                                        <div className="h-5 w-5 rounded-full bg-teal-500 flex items-center justify-center">
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                                                        </div>
                                                    )}
                                                    {step.status === 'active' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                                                    {step.status === 'error' && (
                                                        <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
                                                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`flex-1 text-sm ${
                                                    step.status === 'done'   ? 'text-gray-500' :
                                                    step.status === 'active' ? 'text-gray-900 font-medium' :
                                                    'text-red-500'
                                                }`}>{step.label}</span>
                                                <Badge status={step.status} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Upcoming — pending steps */}
                            {upcomingSteps.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-semibold text-gray-800">Upcoming</h3>
                                        <MoreHorizontal className="h-4 w-4 text-gray-300" />
                                    </div>
                                    <div className="space-y-3.5">
                                        {upcomingSteps.map((step, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <Circle className="h-5 w-5 text-gray-200 shrink-0" />
                                                <span className="flex-1 text-sm text-gray-400">{step.label}</span>
                                                <Badge status="pending" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Result */}
                            {selectedResult && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-semibold text-gray-800">Result</h3>
                                        <div className="flex items-center gap-2">
                                            {selectedResult.truncated && (
                                                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">Truncated</span>
                                            )}
                                            <button onClick={() => setSelectedResult(null)} className="text-gray-300 hover:text-gray-500 transition-colors">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className={`rounded-2xl border overflow-hidden ${selectedResult.error ? 'border-red-100' : 'border-gray-100'}`}>
                                        <div className={`px-5 py-3 border-b flex items-center justify-between ${selectedResult.error ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                                            <span className="text-xs font-semibold text-gray-500 truncate">{selectedResult.name}</span>
                                            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ml-2 shrink-0 ${selectedResult.error ? 'bg-red-100 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                                {selectedResult.error ? 'Failed' : 'Success'}
                                            </span>
                                        </div>
                                        <div className="bg-gray-50 p-5 max-h-[50vh] overflow-y-auto font-mono text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap select-text">
                                            {selectedResult.error
                                                ? <span className="text-red-500">{selectedResult.error}</span>
                                                : typeof selectedResult.data === 'string'
                                                    ? selectedResult.data
                                                    : JSON.stringify(selectedResult.data, null, 2)
                                            }
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
