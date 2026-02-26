'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Zap,
    ShieldAlert,
    Activity,
    Lock,
    RefreshCw,
    Settings,
    Plus,
    Ghost,
    ChevronRight,
    Download,
    Code2,
    Cpu,
    CheckCircle2,
    XCircle,
    Loader2,
    Package,
    Wrench,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { TacticalConsole } from '@/components/tactical-console'

// Include API key header if configured via env
const API_KEY = process.env.NEXT_PUBLIC_GFORCE_API_KEY ?? ''
const AUTH: HeadersInit = API_KEY ? { 'x-gforce-key': API_KEY } : {}

function authFetch(url: string, init?: RequestInit) {
    return fetch(url, {
        ...init,
        headers: { ...AUTH, ...(init?.headers ?? {}) },
    })
}

interface StoredSkill {
    id: string
    name: string
    description: string
    executeBody: string
    createdAt: string
}

interface AuditResult {
    site: string
    status: 'pass' | 'fail'
    title?: string
    error?: string
}

interface SoftwareResult {
    filename: string
    description: string
    code: string
    downloadUrl: string
}

export default function GForcePremium() {
    const [poolStats, setPoolStats] = useState({ slots: 0, inUse: 0, idle: 0, spawning: 0, queued: 0, browsers: 0 })
    const [isForging, setIsForging] = useState(false)
    const [forgeLogs, setForgeLogs] = useState<string[]>([
        '[FORGE] Forge Protocol v3.0.0 Online.',
        '[FORGE] Skill validation: ACTIVE. Persistence: ENABLED.',
    ])
    const [logs, setLogs] = useState<string[]>([
        '[SYSTEM] G-Force G5 Engine. Obsidian Kernel Loaded.',
        '[STEALTH] Red-Team drivers: Active. Hardware Spoofing: Enabled.',
        '[STEALTH] WebGL1 + WebGL2 masked. Fingerprint: Chromium 131.',
        '[READY] Tactical Command interface awaiting input.',
    ])

    // Skill inventory
    const [skills, setSkills] = useState<StoredSkill[]>([])
    const [loadingSkills, setLoadingSkills] = useState(false)

    // Audit state
    const [isAuditing, setIsAuditing] = useState(false)
    const [auditResults, setAuditResults] = useState<AuditResult[] | null>(null)

    // Software Forge state
    const [softwareIntent, setSoftwareIntent] = useState('')
    const [isFabricating, setIsFabricating] = useState(false)
    const [fabricated, setFabricated] = useState<SoftwareResult[]>([])
    const [fabLogs, setFabLogs] = useState<string[]>([
        '[FABRICATOR] Software Forge: Online.',
        '[FABRICATOR] Ready to build any tool or program.',
    ])

    const logsEndRef = useRef<HTMLDivElement>(null)
    const forgeEndRef = useRef<HTMLDivElement>(null)
    const fabEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])
    useEffect(() => { forgeEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [forgeLogs])
    useEffect(() => { fabEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [fabLogs])

    // Poll pool stats every 2s
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await authFetch('/api/pool/stats')
                if (res.ok) setPoolStats(await res.json())
            } catch { /* server may not be ready */ }
        }
        poll()
        const id = setInterval(poll, 2000)
        return () => clearInterval(id)
    }, [])

    // Load skill inventory on mount
    useEffect(() => { fetchSkills() }, [])

    async function fetchSkills() {
        setLoadingSkills(true)
        try {
            const res = await authFetch('/api/skills')
            if (res.ok) setSkills(await res.json())
        } catch { /* ignore */ } finally {
            setLoadingSkills(false)
        }
    }

    // ─── Tactical Command (Skill Forge) ───────────────────────────────────────

    const handleTacticalCommand = async (command: string) => {
        setIsForging(true)
        setForgeLogs(prev => [...prev, `[USER] > ${command}`, `[FORGE] Analyzing intent: "${command}"...`])

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
                    `[FORGE] ✅ Skill validated and hot-loaded: ${data.name}`,
                    `[FORGE] Description: ${data.description}`,
                    `[FORGE] ID: ${data.skillId} — persisted to disk.`,
                ])
                setLogs(prev => [...prev, `[SYSTEM] New skill registered: ${data.name}`])
                toast.success(`Skill Forged: ${data.name}`)
                // Refresh inventory
                fetchSkills()
            } else {
                throw new Error(data.error)
            }
        } catch (err) {
            setForgeLogs(prev => [...prev, `[FORGE] ❌ BLACKSMITHING FAILED: ${(err as Error).message}`])
            toast.error('Forge Protocol Failure')
        } finally {
            setIsForging(false)
        }
    }

    // ─── Real Stealth Audit ────────────────────────────────────────────────────

    const runAudit = async () => {
        if (isAuditing) return
        setIsAuditing(true)
        setAuditResults(null)
        setLogs(prev => [
            ...prev,
            '[AUDIT] Initiating Red-Team stealth audit...',
            '[AUDIT] Launching stealth browser. Testing 3 detection sites...',
        ])

        try {
            const res = await authFetch('/api/audit/run', { method: 'POST' })
            const data = await res.json()

            if (!data.success) throw new Error(data.error ?? 'Audit failed')

            setAuditResults(data.results)
            const passed = data.results.filter((r: AuditResult) => r.status === 'pass').length
            const total = data.results.length

            setLogs(prev => [
                ...prev,
                ...data.results.map((r: AuditResult) =>
                    r.status === 'pass'
                        ? `[AUDIT] ✅ ${r.site} — PASS (${r.title})`
                        : `[AUDIT] ❌ ${r.site} — FAIL: ${r.error}`
                ),
                `[AUDIT] Score: ${passed}/${total} — ${passed === total ? 'UNDETECTABLE' : 'PARTIAL DETECTION'}`,
            ])

            passed === total
                ? toast.success(`Stealth Audit: ${passed}/${total} PASSED`)
                : toast.warning(`Stealth Audit: ${passed}/${total} passed`)
        } catch (err) {
            setLogs(prev => [...prev, `[AUDIT] ❌ Audit error: ${(err as Error).message}`])
            toast.error('Audit Failed')
        } finally {
            setIsAuditing(false)
        }
    }

    // ─── Software Fabricator ──────────────────────────────────────────────────

    const handleFabricate = async () => {
        if (!softwareIntent.trim() || isFabricating) return
        const intent = softwareIntent.trim()
        setSoftwareIntent('')
        setIsFabricating(true)
        setFabLogs(prev => [
            ...prev,
            `[USER] > ${intent}`,
            `[FABRICATOR] Designing software architecture...`,
            `[FABRICATOR] Invoking AI code generation...`,
        ])

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
                `[FABRICATOR] ✅ Software fabricated: ${data.filename}`,
                `[FABRICATOR] Description: ${data.description}`,
                `[FABRICATOR] Saved to tools/${data.filename} — ready to download.`,
            ])
            setFabricated(prev => [...prev, data])
            toast.success(`Software built: ${data.filename}`)
        } catch (err) {
            setFabLogs(prev => [...prev, `[FABRICATOR] ❌ BUILD FAILED: ${(err as Error).message}`])
            toast.error('Fabrication Failed')
        } finally {
            setIsFabricating(false)
        }
    }

    const downloadSkill = (skill: StoredSkill) => {
        window.open(`/api/skills/${skill.id}/download`, '_blank')
    }

    const downloadTool = (tool: SoftwareResult) => {
        window.open(tool.downloadUrl, '_blank')
    }

    return (
        <div className="flex flex-col gap-8 p-10 bg-black min-h-screen text-white font-sans selection:bg-yellow-500 selection:text-black">
            <Toaster position="top-right" theme="dark" />

            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500 to-transparent opacity-20 blur group-hover:opacity-40 transition duration-1000"></div>
                    <div className="relative">
                        <h1 className="text-5xl font-black tracking-tighter flex items-center gap-4 italic leading-none">
                            <Zap className="h-12 w-12 text-yellow-500 fill-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
                            G-FORCE <span className="text-zinc-600 font-light text-3xl not-italic ml-2 tracking-normal uppercase">Command</span>
                        </h1>
                        <div className="flex items-center gap-3 mt-4">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                            <p className="text-zinc-500 text-xs font-black tracking-[0.3em] uppercase">SYSTEM.ONLINE // MODE.STANDALONE</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={runAudit}
                        disabled={isAuditing}
                        className="group relative px-6 py-3 bg-zinc-900 border border-white/5 rounded-xl transition-all hover:bg-zinc-800 hover:border-yellow-500/50 disabled:opacity-50"
                    >
                        <div className="flex items-center gap-3">
                            {isAuditing
                                ? <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                : <ShieldAlert className="h-4 w-4 text-yellow-500 group-hover:animate-pulse" />
                            }
                            <span className="text-xs font-black tracking-widest uppercase">
                                {isAuditing ? 'AUDITING...' : 'STEALTH AUDIT'}
                            </span>
                        </div>
                    </button>

                    <button className="px-6 py-3 bg-yellow-500 text-black rounded-xl font-black text-xs tracking-widest uppercase hover:bg-yellow-400 transition-colors flex items-center gap-3 shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                        <Plus className="h-4 w-4" /> NEW MISSION
                    </button>

                    <button className="p-3 bg-zinc-900 border border-white/5 rounded-xl hover:bg-zinc-800 transition-colors">
                        <Settings className="h-5 w-5 text-zinc-500" />
                    </button>
                </div>
            </div>

            {/* Audit Results Banner */}
            {auditResults && (
                <div className="grid grid-cols-3 gap-4">
                    {auditResults.map(r => (
                        <div
                            key={r.site}
                            className={`rounded-xl p-4 border flex items-center gap-3 ${
                                r.status === 'pass'
                                    ? 'bg-green-500/10 border-green-500/30'
                                    : 'bg-red-500/10 border-red-500/30'
                            }`}
                        >
                            {r.status === 'pass'
                                ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                                : <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                            }
                            <div>
                                <div className="text-xs font-black text-zinc-300">{r.site}</div>
                                <div className={`text-[10px] font-bold tracking-widest ${r.status === 'pass' ? 'text-green-500' : 'text-red-400'}`}>
                                    {r.status === 'pass' ? 'UNDETECTED' : 'DETECTED'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Tactical Layer */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                <div className="xl:col-span-3 flex flex-col gap-8">
                    <TacticalConsole onCommand={handleTacticalCommand} isForging={isForging} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                        <TerminalWindow
                            title="MISSION LOG"
                            logs={logs}
                            color="text-yellow-100"
                            dot="bg-red-500"
                            scrollRef={logsEndRef}
                        />
                        <TerminalWindow
                            title="FORGE BLACKSMITH"
                            logs={forgeLogs}
                            color="text-yellow-500"
                            dot="bg-yellow-500"
                            scrollRef={forgeEndRef}
                        />
                    </div>
                </div>

                {/* Sidebar */}
                <div className="flex flex-col gap-8">
                    <div className="space-y-4">
                        <StatCardSmall title="ACTIVE" value={poolStats.inUse} color="text-yellow-500" icon={Ghost} />
                        <StatCardSmall title="STEALTH" value="HUMAN-ZERO" color="text-green-500" icon={Lock} />
                        <StatCardSmall title="IDLE" value={poolStats.idle} color="text-blue-500" icon={Activity} />
                    </div>

                    {/* Fleet Manifest */}
                    <div className="bg-zinc-950 border border-white/5 rounded-2xl p-6 flex flex-col h-full relative overflow-hidden">
                        <h3 className="text-[10px] font-black tracking-[0.4em] text-zinc-500 uppercase mb-3 flex items-center justify-between">
                            FLEET MANIFEST
                            <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: '10s' }} />
                        </h3>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {[
                                { label: 'SLOTS', value: `${poolStats.slots}/100` },
                                { label: 'QUEUED', value: poolStats.queued },
                                { label: 'BROWSERS', value: poolStats.browsers },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-black/40 rounded-lg p-2 text-center border border-white/5">
                                    <div className="text-[8px] font-black tracking-widest text-zinc-600 uppercase">{label}</div>
                                    <div className="text-sm font-black text-zinc-300 mt-0.5">{value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2 flex-1 overflow-y-auto">
                            {poolStats.inUse === 0 && poolStats.spawning === 0 ? (
                                <div className="text-zinc-700 text-[10px] font-black tracking-widest uppercase text-center py-6">
                                    No active agents
                                </div>
                            ) : (
                                <>
                                    {Array.from({ length: Math.min(poolStats.inUse, 8) }).map((_, i) => (
                                        <BotNode key={`active-${i}`} name={`AGENT-${i + 1}`} status="ACTIVE" type="Pool Slot" active />
                                    ))}
                                    {poolStats.spawning > 0 && (
                                        <BotNode name="SPAWNING..." status="INIT" type="Launching" active={false} />
                                    )}
                                    {poolStats.inUse > 8 && (
                                        <div className="text-zinc-600 text-[9px] font-black tracking-widest uppercase text-center py-1">
                                            +{poolStats.inUse - 8} more active
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Software Fabricator ───────────────────────────────────────────── */}
            <div className="bg-zinc-950 border border-white/5 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <Cpu className="h-5 w-5 text-purple-400" />
                    <h2 className="text-[11px] font-black tracking-[0.4em] text-zinc-400 uppercase">
                        SOFTWARE FABRICATOR — Build Any Tool or Program
                    </h2>
                </div>

                <div className="flex gap-3">
                    <input
                        value={softwareIntent}
                        onChange={e => setSoftwareIntent(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleFabricate()}
                        placeholder="Describe software to build... e.g. 'a scraper that extracts product prices from any URL'"
                        className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50 font-mono"
                        disabled={isFabricating}
                    />
                    <button
                        onClick={handleFabricate}
                        disabled={isFabricating || !softwareIntent.trim()}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-black text-xs tracking-widest uppercase transition-colors flex items-center gap-2"
                    >
                        {isFabricating
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> BUILDING...</>
                            : <><Wrench className="h-4 w-4" /> FABRICATE</>
                        }
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Fabricator log */}
                    <div className="bg-black/40 border border-white/5 rounded-xl h-48 overflow-y-auto p-4 font-mono text-[11px]">
                        {fabLogs.map((log, i) => (
                            <div key={i} className="flex gap-2 mb-1">
                                <span className="text-zinc-700 min-w-[20px]">{i + 1}</span>
                                <span className="text-purple-300">{log}</span>
                            </div>
                        ))}
                        <div ref={fabEndRef} />
                    </div>

                    {/* Built tools list */}
                    <div className="space-y-2 overflow-y-auto max-h-48">
                        {fabricated.length === 0 ? (
                            <div className="text-zinc-700 text-[10px] font-black tracking-widest uppercase text-center py-6">
                                No software built yet
                            </div>
                        ) : (
                            fabricated.map((tool, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl hover:border-purple-500/30 transition-all">
                                    <div className="flex items-center gap-3">
                                        <Code2 className="h-4 w-4 text-purple-400 shrink-0" />
                                        <div>
                                            <div className="text-xs font-black text-zinc-300">{tool.filename}</div>
                                            <div className="text-[10px] text-zinc-600 truncate max-w-[200px]">{tool.description}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => downloadTool(tool)}
                                        className="p-2 bg-purple-600/20 hover:bg-purple-600/40 rounded-lg transition-colors"
                                    >
                                        <Download className="h-3.5 w-3.5 text-purple-400" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Skill Inventory ──────────────────────────────────────────────── */}
            <div className="bg-zinc-950 border border-white/5 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Package className="h-5 w-5 text-yellow-500" />
                        <h2 className="text-[11px] font-black tracking-[0.4em] text-zinc-400 uppercase">
                            SKILL REGISTRY — {skills.length} Persisted
                        </h2>
                    </div>
                    <button
                        onClick={fetchSkills}
                        className="p-2 bg-zinc-900 border border-white/5 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                        {loadingSkills
                            ? <Loader2 className="h-3.5 w-3.5 text-zinc-500 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                        }
                    </button>
                </div>

                {skills.length === 0 ? (
                    <div className="text-zinc-700 text-[10px] font-black tracking-widest uppercase text-center py-8">
                        No skills forged yet — use the Tactical Console above
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {skills.map(skill => (
                            <div
                                key={skill.id}
                                className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-xl hover:border-yellow-500/30 transition-all group"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-black text-zinc-200 group-hover:text-white transition-colors truncate">{skill.name}</div>
                                    <div className="text-[10px] text-zinc-600 truncate">{skill.description}</div>
                                    <div className="text-[9px] text-zinc-700 font-mono mt-1">{skill.id}</div>
                                </div>
                                <button
                                    onClick={() => downloadSkill(skill)}
                                    title={`Download ${skill.id}.ts`}
                                    className="ml-3 p-2 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-lg transition-colors shrink-0"
                                >
                                    <Download className="h-3.5 w-3.5 text-yellow-500" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TerminalWindow({ title, logs, color, dot, scrollRef }: {
    title: string; logs: string[]; color: string; dot: string; scrollRef: React.RefObject<HTMLDivElement | null>
}) {
    return (
        <div className="bg-zinc-950 border border-white/5 rounded-2xl flex flex-col overflow-hidden h-[450px]">
            <div className="px-5 py-3 border-b border-white/5 bg-white/2 flex justify-between items-center">
                <span className="text-[10px] font-black tracking-[0.3em] text-zinc-400 flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${dot} animate-pulse`} />
                    {title}
                </span>
                <div className="flex gap-2">
                    <div className="h-2 w-2 rounded-full bg-zinc-800" />
                    <div className="h-2 w-2 rounded-full bg-zinc-800" />
                    <div className="h-2 w-2 rounded-full bg-zinc-800" />
                </div>
            </div>
            <div className="p-5 font-mono text-[11px] leading-relaxed overflow-y-auto flex-1 bg-black/20">
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 mb-1">
                        <span className="text-zinc-800 font-bold min-w-[20px] select-none">{i + 1}</span>
                        <span className={color}>{log}</span>
                    </div>
                ))}
                <div ref={scrollRef} />
                <div className="flex items-center gap-1 mt-2 animate-pulse">
                    <div className="h-3 w-1.5 bg-yellow-500 ml-8" />
                </div>
            </div>
        </div>
    )
}

function StatCardSmall({ title, value, color, icon: Icon }: {
    title: string; value: string | number; color: string; icon: React.ElementType
}) {
    return (
        <div className="bg-zinc-950 border border-white/5 rounded-xl p-5 flex items-center justify-between hover:border-white/10 transition-all">
            <div className="flex flex-col">
                <span className="text-[9px] font-black tracking-widest text-zinc-600 uppercase mb-1">{title}</span>
                <span className={`text-2xl font-black tracking-tighter ${color}`}>{value}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-white/2 border border-white/5">
                <Icon className={`h-4 w-4 ${color}`} />
            </div>
        </div>
    )
}

function BotNode({ name, status, type, active }: { name: string; status: string; type: string; active: boolean }) {
    return (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/5 hover:border-yellow-500/20 transition-all group cursor-pointer">
            <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-zinc-900 flex items-center justify-center border border-white/5">
                    <Ghost className={`h-3.5 w-3.5 ${active ? 'text-yellow-500' : 'text-zinc-600'}`} />
                </div>
                <div className="flex flex-col">
                    <span className="text-[11px] font-black tracking-tight text-zinc-300">{name}</span>
                    <span className="text-[9px] font-medium text-zinc-600 uppercase">{type}</span>
                </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
                <span className={`text-[9px] font-black tracking-widest ${active ? 'text-yellow-500' : 'text-zinc-600'}`}>{status}</span>
                <ChevronRight className="h-3 w-3 text-zinc-800 group-hover:text-white transition-colors" />
            </div>
        </div>
    )
}
