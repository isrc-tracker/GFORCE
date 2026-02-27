'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Zap, ShieldAlert, Activity, Lock, RefreshCw, Settings,
    Ghost, ChevronRight, Download, Code2, Cpu, CheckCircle2,
    XCircle, Loader2, Package, Wrench, Play, X, Terminal,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { TacticalConsole } from '@/components/tactical-console'

const API_KEY = process.env.NEXT_PUBLIC_GFORCE_API_KEY ?? ''
const AUTH: HeadersInit = API_KEY ? { 'x-gforce-key': API_KEY } : {}

function authFetch(url: string, init?: RequestInit) {
    return fetch(url, { ...init, headers: { ...AUTH, ...(init?.headers ?? {}) } })
}

interface StoredSkill { id: string; name: string; description: string; executeBody: string; createdAt: string }
interface AuditResult { site: string; status: 'pass' | 'fail'; title?: string; error?: string }
interface SoftwareResult { filename: string; description: string; code: string; downloadUrl: string }
interface SkillRunResult { skillId: string; name: string; data: any; error?: string; truncated?: boolean }

export default function GForcePremium() {
    const [poolStats, setPoolStats] = useState({ slots: 0, inUse: 0, idle: 0, spawning: 0, queued: 0, browsers: 0 })
    const [isForging, setIsForging] = useState(false)
    const [forgeLogs, setForgeLogs] = useState<string[]>([
        '[FORGE] Forge Protocol v3.0.0 — Online',
        '[FORGE] Skill validation: ACTIVE. Persistence: ENABLED.',
    ])
    const [logs, setLogs] = useState<string[]>([
        '[SYSTEM] G-Force G5 Engine. Obsidian Kernel loaded.',
        '[STEALTH] Red-Team drivers active. Hardware spoofing enabled.',
        '[STEALTH] WebGL1 + WebGL2 masked. Fingerprint: Chromium 131.',
        '[READY] Tactical Command interface awaiting input.',
    ])
    const [skills, setSkills] = useState<StoredSkill[]>([])
    const [loadingSkills, setLoadingSkills] = useState(false)
    const [isAuditing, setIsAuditing] = useState(false)
    const [auditResults, setAuditResults] = useState<AuditResult[] | null>(null)
    const [softwareIntent, setSoftwareIntent] = useState('')
    const [isFabricating, setIsFabricating] = useState(false)
    const [fabricated, setFabricated] = useState<SoftwareResult[]>([])
    const [fabLogs, setFabLogs] = useState<string[]>([
        '[FABRICATOR] Software Forge — Online.',
        '[FABRICATOR] Ready to build any tool or program.',
    ])
    const [runningSkillId, setRunningSkillId] = useState<string | null>(null)
    const [skillResult, setSkillResult] = useState<SkillRunResult | null>(null)

    const logsEndRef = useRef<HTMLDivElement>(null)
    const forgeEndRef = useRef<HTMLDivElement>(null)
    const fabEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])
    useEffect(() => { forgeEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [forgeLogs])
    useEffect(() => { fabEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [fabLogs])

    useEffect(() => {
        const poll = async () => {
            try {
                const res = await authFetch('/api/pool/stats')
                if (res.ok) setPoolStats(await res.json())
            } catch { }
        }
        poll()
        const id = setInterval(poll, 2000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => { fetchSkills() }, [])

    async function fetchSkills() {
        setLoadingSkills(true)
        try {
            const res = await authFetch('/api/skills')
            if (res.ok) setSkills(await res.json())
        } catch { } finally { setLoadingSkills(false) }
    }

    const handleTacticalCommand = async (command: string) => {
        setIsForging(true)
        setForgeLogs(prev => [...prev, `[USER] > ${command}`, `[FORGE] Analyzing intent...`])
        try {
            const res = await authFetch('/api/forge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent: command }),
            })
            const data = await res.json()
            if (data.success) {
                setForgeLogs(prev => [
                    ...prev,
                    `[FORGE] ✅ Skill validated: ${data.name}`,
                    `[FORGE] ID: ${data.skillId} — persisted to disk.`,
                ])
                setLogs(prev => [...prev, `[SYSTEM] New skill registered: ${data.name}`])
                toast.success(`Skill forged: ${data.name}`)
                fetchSkills()
            } else {
                throw new Error(data.error)
            }
        } catch (err) {
            setForgeLogs(prev => [...prev, `[FORGE] ❌ FAILED: ${(err as Error).message}`])
            toast.error('Forge failed')
        } finally {
            setIsForging(false)
        }
    }

    const runAudit = async () => {
        if (isAuditing) return
        setIsAuditing(true)
        setAuditResults(null)
        setLogs(prev => [...prev, '[AUDIT] Initiating stealth audit — 3 detection sites...'])
        try {
            const res = await authFetch('/api/audit/run', { method: 'POST' })
            const data = await res.json()
            if (!data.success) throw new Error(data.error ?? 'Audit failed')
            setAuditResults(data.results)
            const passed = data.results.filter((r: AuditResult) => r.status === 'pass').length
            setLogs(prev => [
                ...prev,
                ...data.results.map((r: AuditResult) =>
                    r.status === 'pass' ? `[AUDIT] ✅ ${r.site} — PASS` : `[AUDIT] ❌ ${r.site} — FAIL: ${r.error}`
                ),
                `[AUDIT] Score: ${passed}/${data.results.length}`,
            ])
            passed === data.results.length
                ? toast.success(`Stealth audit: ${passed}/${data.results.length} passed`)
                : toast.warning(`Stealth audit: ${passed}/${data.results.length} passed`)
        } catch (err) {
            setLogs(prev => [...prev, `[AUDIT] ❌ ${(err as Error).message}`])
            toast.error('Audit failed')
        } finally {
            setIsAuditing(false)
        }
    }

    const handleFabricate = async () => {
        if (!softwareIntent.trim() || isFabricating) return
        const intent = softwareIntent.trim()
        setSoftwareIntent('')
        setIsFabricating(true)
        setFabLogs(prev => [...prev, `[USER] > ${intent}`, `[FABRICATOR] Generating...`])
        try {
            const res = await authFetch('/api/software', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent }),
            })
            const data = await res.json()
            if (!data.success) throw new Error(data.error)
            setFabLogs(prev => [
                ...prev,
                `[FABRICATOR] ✅ ${data.filename} — ${data.description}`,
            ])
            setFabricated(prev => [...prev, data])
            toast.success(`Built: ${data.filename}`)
        } catch (err) {
            setFabLogs(prev => [...prev, `[FABRICATOR] ❌ ${(err as Error).message}`])
            toast.error('Fabrication failed')
        } finally {
            setIsFabricating(false)
        }
    }

    const handleRunSkill = async (skill: StoredSkill) => {
        setRunningSkillId(skill.id)
        setSkillResult(null)
        setLogs(prev => [...prev, `[EXEC] Running skill: ${skill.name}...`])
        try {
            const res = await authFetch(`/api/skills/${skill.id}/execute`, { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                setSkillResult({
                    skillId: skill.id,
                    name: skill.name,
                    data: data.result,
                    truncated: Boolean(data.truncated),
                })
                setLogs(prev => [...prev, `[EXEC] OK ${skill.name} - completed${data.truncated ? ' (truncated output)' : ''}`])
                toast.success(`${skill.name} executed`)
            } else {
                setSkillResult({ skillId: skill.id, name: skill.name, data: null, error: data.error })
                setLogs(prev => [...prev, `[EXEC] FAIL ${skill.name} - ${data.error}`])
                toast.error('Skill execution failed')
            }
        } catch (err) {
            const msg = (err as Error).message
            setSkillResult({ skillId: skill.id, name: skill.name, data: null, error: msg })
            setLogs(prev => [...prev, `[EXEC] FAIL ${skill.name} - ${msg}`])
            toast.error('Skill execution failed')
        } finally {
            setRunningSkillId(null)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-yellow-500 selection:text-black">
            <Toaster position="top-right" theme="dark" richColors />

            {/* ── Header ── */}
            <header className="border-b border-white/[0.06] px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Zap className="h-7 w-7 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_12px_rgba(234,179,8,0.6)]" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight leading-none">G-FORCE</h1>
                            <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase mt-0.5">Command Interface</p>
                        </div>
                    </div>
                    <div className="h-4 w-px bg-white/10 ml-2" />
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase">Online</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 px-4 py-2 bg-zinc-950 border border-white/[0.06] rounded-xl">
                        <Stat label="Active" value={poolStats.inUse} color="text-yellow-400" />
                        <div className="h-3 w-px bg-white/10" />
                        <Stat label="Idle" value={poolStats.idle} color="text-blue-400" />
                        <div className="h-3 w-px bg-white/10" />
                        <Stat label="Queued" value={poolStats.queued} color="text-zinc-400" />
                    </div>
                    <button
                        onClick={runAudit}
                        disabled={isAuditing}
                        className="flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border border-white/[0.06] rounded-xl text-xs font-bold tracking-widest uppercase hover:border-yellow-500/30 hover:text-yellow-400 transition-all disabled:opacity-50"
                    >
                        {isAuditing
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Auditing</>
                            : <><ShieldAlert className="h-3.5 w-3.5" /> Audit</>
                        }
                    </button>
                    <button className="p-2.5 bg-zinc-950 border border-white/[0.06] rounded-xl hover:border-white/20 transition-all">
                        <Settings className="h-4 w-4 text-zinc-500" />
                    </button>
                </div>
            </header>

            <main className="p-8 space-y-6">
                {/* ── Audit Results ── */}
                {auditResults && (
                    <div className="grid grid-cols-3 gap-3">
                        {auditResults.map(r => (
                            <div key={r.site} className={`flex items-center gap-3 p-4 rounded-xl border ${r.status === 'pass' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                {r.status === 'pass'
                                    ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                                    : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                                }
                                <div>
                                    <div className="text-xs font-bold text-white">{r.site}</div>
                                    <div className={`text-[10px] font-bold tracking-widest uppercase ${r.status === 'pass' ? 'text-green-500' : 'text-red-400'}`}>
                                        {r.status === 'pass' ? 'Undetected' : 'Detected'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Main Grid ── */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    {/* Left 3 cols */}
                    <div className="xl:col-span-3 space-y-6">
                        <TacticalConsole onCommand={handleTacticalCommand} isForging={isForging} />

                        <div className="grid grid-cols-2 gap-6">
                            <LogWindow title="Mission Log" logs={logs} accent="text-zinc-300" dot="bg-red-500" scrollRef={logsEndRef} />
                            <LogWindow title="Forge Blacksmith" logs={forgeLogs} accent="text-yellow-400" dot="bg-yellow-500" scrollRef={forgeEndRef} />
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        <Card>
                            <SectionLabel icon={Ghost} label="Fleet Manifest" />
                            <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
                                {[
                                    { label: 'Slots', value: `${poolStats.slots}/100` },
                                    { label: 'Browsers', value: poolStats.browsers },
                                    { label: 'Spawning', value: poolStats.spawning },
                                ].map(({ label, value }) => (
                                    <div key={label} className="text-center p-2 bg-black/40 rounded-lg border border-white/[0.04]">
                                        <div className="text-[8px] font-bold tracking-widest text-zinc-600 uppercase">{label}</div>
                                        <div className="text-sm font-black text-zinc-300 mt-0.5">{value}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {poolStats.inUse === 0 && poolStats.spawning === 0 ? (
                                    <div className="text-zinc-700 text-[10px] font-bold tracking-widest uppercase text-center py-6">No active agents</div>
                                ) : (
                                    Array.from({ length: Math.min(poolStats.inUse, 6) }).map((_, i) => (
                                        <AgentRow key={i} name={`Agent-${i + 1}`} active />
                                    ))
                                )}
                                {poolStats.inUse > 6 && (
                                    <div className="text-zinc-600 text-[9px] font-bold uppercase text-center py-1">+{poolStats.inUse - 6} more</div>
                                )}
                            </div>
                        </Card>

                        <Card>
                            <SectionLabel icon={Lock} label="Stealth Status" />
                            <div className="space-y-2 mt-3">
                                {[
                                    { label: 'WebGL Masking', status: 'Active' },
                                    { label: 'Canvas Noise', status: 'Active' },
                                    { label: 'UA Spoofing', status: 'Active' },
                                    { label: 'Human-Zero Mode', status: 'Active' },
                                ].map(({ label, status }) => (
                                    <div key={label} className="flex items-center justify-between">
                                        <span className="text-[10px] text-zinc-500">{label}</span>
                                        <span className="text-[9px] font-bold text-green-400 tracking-widest uppercase">{status}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>

                {/* ── Skill Registry ── */}
                <Card>
                    <div className="flex items-center justify-between mb-5">
                        <SectionLabel icon={Package} label={`Skill Registry — ${skills.length} saved`} />
                        <button
                            onClick={fetchSkills}
                            className="p-2 rounded-lg bg-zinc-900 border border-white/[0.06] hover:border-white/20 transition-all"
                        >
                            {loadingSkills
                                ? <Loader2 className="h-3.5 w-3.5 text-zinc-500 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                            }
                        </button>
                    </div>

                    {skills.length === 0 ? (
                        <div className="text-zinc-700 text-[11px] font-bold tracking-widest uppercase text-center py-10">
                            No skills forged yet — use the Tactical Console above
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {skills.map(skill => (
                                <div key={skill.id} className="group flex items-center justify-between p-4 bg-black/40 border border-white/[0.06] rounded-xl hover:border-yellow-500/20 transition-all">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2 bg-yellow-500/10 rounded-lg shrink-0">
                                            <Zap className="h-3.5 w-3.5 text-yellow-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors truncate">{skill.name}</div>
                                            <div className="text-[10px] text-zinc-600 truncate mt-0.5">{skill.description}</div>
                                            <div className="text-[9px] text-zinc-700 font-mono mt-0.5 truncate">{skill.id}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                                        <button
                                            onClick={() => handleRunSkill(skill)}
                                            disabled={runningSkillId !== null}
                                            title="Run skill"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 hover:border-yellow-500/40 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {runningSkillId === skill.id
                                                ? <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
                                                : <Play className="h-3 w-3 text-yellow-400" />
                                            }
                                            <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                                                {runningSkillId === skill.id ? 'Running' : 'Run'}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => window.open(`/api/skills/${skill.id}/download`, '_blank')}
                                            title="Download skill"
                                            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] hover:border-white/20 rounded-lg transition-all"
                                        >
                                            <Download className="h-3 w-3 text-zinc-400" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Result Panel */}
                    {skillResult && (
                        <div className={`mt-4 rounded-xl border overflow-hidden ${skillResult.error ? 'border-red-500/30' : 'border-green-500/20'}`}>
                            <div className={`flex items-center justify-between px-4 py-2.5 ${skillResult.error ? 'bg-red-500/10' : 'bg-green-500/5'}`}>
                                <div className="flex items-center gap-2">
                                    <Terminal className="h-3.5 w-3.5 text-zinc-400" />
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">
                                        Last Run: {skillResult.name}
                                    </span>
                                    {skillResult.error
                                        ? <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Failed</span>
                                        : <span className="text-[9px] font-bold text-green-400 uppercase tracking-widest">Success</span>
                                    }
                                    {!skillResult.error && skillResult.truncated && (
                                        <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest">Truncated</span>
                                    )}
                                </div>
                                <button onClick={() => setSkillResult(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="bg-black/60 p-4 max-h-72 overflow-y-auto font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                {skillResult.error
                                    ? <span className="text-red-400">{skillResult.error}</span>
                                    : (typeof skillResult.data === 'string'
                                        ? skillResult.data
                                        : JSON.stringify(skillResult.data, null, 2))
                                }
                            </div>
                        </div>
                    )}
                </Card>

                {/* ── Software Fabricator ── */}
                <Card>
                    <div className="flex items-center gap-3 mb-5">
                        <SectionLabel icon={Cpu} label="Software Fabricator" accent="text-violet-400" />
                        <span className="text-[10px] text-zinc-600">Build any standalone tool or script</span>
                    </div>

                    <div className="flex gap-3 mb-4">
                        <input
                            value={softwareIntent}
                            onChange={e => setSoftwareIntent(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleFabricate()}
                            placeholder="Describe software to build... e.g. a script that monitors URLs for changes"
                            className="flex-1 bg-black/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/40 font-mono transition-all"
                            disabled={isFabricating}
                        />
                        <button
                            onClick={handleFabricate}
                            disabled={isFabricating || !softwareIntent.trim()}
                            className="px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs tracking-widest uppercase transition-colors flex items-center gap-2"
                        >
                            {isFabricating
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building</>
                                : <><Wrench className="h-3.5 w-3.5" /> Build</>
                            }
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/40 border border-white/[0.04] rounded-xl h-44 overflow-y-auto p-4 font-mono text-[11px]">
                            {fabLogs.map((log, i) => (
                                <div key={i} className="flex gap-2 mb-1">
                                    <span className="text-zinc-800 min-w-[20px]">{i + 1}</span>
                                    <span className="text-violet-300">{log}</span>
                                </div>
                            ))}
                            <div ref={fabEndRef} />
                        </div>
                        <div className="space-y-2 overflow-y-auto max-h-44">
                            {fabricated.length === 0 ? (
                                <div className="text-zinc-700 text-[10px] font-bold tracking-widest uppercase text-center py-8">No software built yet</div>
                            ) : (
                                fabricated.map((tool, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-black/40 border border-white/[0.06] rounded-xl hover:border-violet-500/20 transition-all">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Code2 className="h-4 w-4 text-violet-400 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-zinc-300 truncate">{tool.filename}</div>
                                                <div className="text-[10px] text-zinc-600 truncate">{tool.description}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => window.open(tool.downloadUrl, '_blank')}
                                            className="ml-3 p-2 bg-violet-600/20 hover:bg-violet-600/40 rounded-lg transition-colors shrink-0"
                                        >
                                            <Download className="h-3.5 w-3.5 text-violet-400" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-zinc-950 border border-white/[0.06] rounded-2xl p-6">
            {children}
        </div>
    )
}

function SectionLabel({ icon: Icon, label, accent = 'text-zinc-400' }: { icon: React.ElementType; label: string; accent?: string }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${accent}`} />
            <span className={`text-[10px] font-black tracking-[0.3em] uppercase ${accent}`}>{label}</span>
        </div>
    )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
        <div className="text-center">
            <div className="text-[8px] font-bold tracking-widest text-zinc-600 uppercase">{label}</div>
            <div className={`text-sm font-black ${color}`}>{value}</div>
        </div>
    )
}

function LogWindow({ title, logs, accent, dot, scrollRef }: {
    title: string; logs: string[]; accent: string; dot: string; scrollRef: React.RefObject<HTMLDivElement | null>
}) {
    return (
        <div className="bg-zinc-950 border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden h-[400px]">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-pulse`} />
                    <span className="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">{title}</span>
                </div>
                <div className="flex gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-zinc-800" />
                    <div className="h-2 w-2 rounded-full bg-zinc-800" />
                    <div className="h-2 w-2 rounded-full bg-zinc-800" />
                </div>
            </div>
            <div className="p-4 font-mono text-[11px] leading-relaxed overflow-y-auto flex-1 bg-black/20 space-y-0.5">
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                        <span className="text-zinc-800 font-bold min-w-[20px] select-none">{i + 1}</span>
                        <span className={accent}>{log}</span>
                    </div>
                ))}
                <div ref={scrollRef} />
            </div>
        </div>
    )
}

function AgentRow({ name, active }: { name: string; active: boolean }) {
    return (
        <div className="flex items-center justify-between p-2.5 bg-black/40 border border-white/[0.04] rounded-xl">
            <div className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-lg bg-zinc-900 flex items-center justify-center border border-white/[0.06]">
                    <Ghost className={`h-3 w-3 ${active ? 'text-yellow-500' : 'text-zinc-600'}`} />
                </div>
                <span className="text-[11px] font-bold text-zinc-400">{name}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-700'}`} />
                <span className={`text-[9px] font-bold tracking-widest uppercase ${active ? 'text-yellow-500' : 'text-zinc-600'}`}>
                    {active ? 'Active' : 'Idle'}
                </span>
                <ChevronRight className="h-3 w-3 text-zinc-700" />
            </div>
        </div>
    )
}
