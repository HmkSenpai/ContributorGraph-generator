import { useEffect, useRef, useState, useCallback } from "react"
import { THEMES } from "./lib/themes"
import { textToData } from "./lib/fonts5x7"
import { GIFEncoder, quantize, applyPalette } from "gifenc"
import { fetchGithubContributions, contributionsToData } from "./lib/github"

type Data = number[][]

const LS_KEY = "contrib-graph-v2"

function cloneData(d: Data): Data { return d.map(c => c.slice()) }

function makeEmptyData(cols: number, rows: number, fill = 0): Data {
  return Array.from({ length: cols }, () => Array(rows).fill(fill))
}

export default function App() {
  const [cols, setCols] = useState(26)
  const [rows, setRows] = useState(7)
  const [cellSize, setCellSize] = useState(14)
  const [gap, setGap] = useState(4)
  const [radius, setRadius] = useState(2)
  const [exportScale, setExportScale] = useState(3)
  const [colors, setColors] = useState<string[]>(["#161b22","#0e4429","#006d32","#26a641","#39d353"])
  const [data, setData] = useState<Data>(() => makeEmptyData(26,7))
  const [brush, setBrush] = useState(0)
  const [gifDuration, setGifDuration] = useState(2)
  const [gifFps, setGifFps] = useState(15)
  const [gifMode, setGifMode] = useState<"draw" | "wave">("draw")
  const [textInput, setTextInput] = useState("HI")
  const [showGifModal, setShowGifModal] = useState(false)
  const [isExportingGif, setIsExportingGif] = useState(false)
  const [ghUser, setGhUser] = useState("Hmksenpai")
  const [ghYear, setGhYear] = useState<string>("")
  const [ghToken, setGhToken] = useState("")
  const [ghLoading, setGhLoading] = useState(false)
  const [ghError, setGhError] = useState<string | null>(null)
  const [ghInfo, setGhInfo] = useState<string | null>(null)

  const undoRef = useRef<Data[]>([])
  const redoRef = useRef<Data[]>([])
  const [, forceRender] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPainting = useRef(false)

  // load LS + share hash
  useEffect(() => {
    try {
      const hash = location.hash
      if (hash.startsWith("#g=")) {
        const payload = JSON.parse(decodeURIComponent(atob(hash.slice(3))))
        if (payload.co) setCols(payload.co)
        if (payload.ro) setRows(payload.ro)
        if (payload.cs) setCellSize(payload.cs)
        if (payload.g !== undefined) setGap(payload.g)
        if (payload.r !== undefined) setRadius(payload.r)
        if (payload.c) setColors(payload.c)
        if (payload.d) setData(payload.d)
        return
      }
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.cols) setCols(parsed.cols)
        if (parsed.rows) setRows(parsed.rows)
        if (parsed.cellSize) setCellSize(parsed.cellSize)
        if (parsed.gap !== undefined) setGap(parsed.gap)
        if (parsed.radius !== undefined) setRadius(parsed.radius)
        if (parsed.colors) setColors(parsed.colors)
        if (parsed.data) setData(parsed.data)
        if (parsed.exportScale) setExportScale(parsed.exportScale)
      }
    } catch {}
  }, [])
  // save
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ cols, rows, cellSize, gap, radius, colors, data, exportScale }))
  }, [cols, rows, cellSize, gap, radius, colors, data, exportScale])

  const pushUndo = useCallback(() => {
    undoRef.current.push(cloneData(data))
    if (undoRef.current.length > 50) undoRef.current.shift()
    redoRef.current = []
    forceRender(x=>x+1)
  }, [data])

  const undo = useCallback(() => {
    const prev = undoRef.current.pop()
    if (!prev) return
    redoRef.current.push(cloneData(data))
    setData(prev)
  }, [data])

  const redo = useCallback(() => {
    const nxt = redoRef.current.pop()
    if (!nxt) return
    undoRef.current.push(cloneData(data))
    setData(nxt)
  }, [data])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey
      if (isMod && e.key.toLowerCase()==="z" && !e.shiftKey) { e.preventDefault(); undo() }
      if (isMod && (e.key.toLowerCase()==="y" || (e.key.toLowerCase()==="z" && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener("keydown", handler)
    return ()=> window.removeEventListener("keydown", handler)
  }, [undo, redo])

  // canvas draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const w = cols * cellSize + (cols - 1) * gap
    const h = rows * cellSize + (rows - 1) * gap
    canvas.width = w
    canvas.height = h
    canvas.style.width = w + "px"
    canvas.style.height = h + "px"
    ctx.clearRect(0,0,w,h)
    for (let x=0;x<cols;x++) for(let y=0;y<rows;y++) {
      const level = data[x]?.[y] ?? 0
      const px = x*(cellSize+gap)
      const py = y*(cellSize+gap)
      const r = Math.min(radius, cellSize/2)
      if (level===-1) {
        // dead pattern
        ctx.save()
        const rr = r
        ctx.beginPath()
        ctx.moveTo(px+rr, py)
        ctx.arcTo(px+cellSize, py, px+cellSize, py+cellSize, rr)
        ctx.arcTo(px+cellSize, py+cellSize, px, py+cellSize, rr)
        ctx.arcTo(px, py+cellSize, px, py, rr)
        ctx.arcTo(px, py, px+cellSize, py, rr)
        ctx.closePath()
        ctx.clip()
        ctx.fillStyle="rgba(255,255,255,0.04)"
        ctx.fillRect(px,py,cellSize,cellSize)
        ctx.strokeStyle="rgba(139,148,158,0.45)"
        ctx.lineWidth=1
        const step = Math.max(3, Math.round(cellSize/3))
        for(let d=-cellSize; d<cellSize; d+=step){
          ctx.beginPath(); ctx.moveTo(px+d, py+cellSize); ctx.lineTo(px+d+cellSize, py); ctx.stroke()
        }
        ctx.restore()
        continue
      }
      ctx.fillStyle = colors[level] ?? colors[0]
      ctx.beginPath()
      ctx.moveTo(px+r, py)
      ctx.arcTo(px+cellSize, py, px+cellSize, py+cellSize, r)
      ctx.arcTo(px+cellSize, py+cellSize, px, py+cellSize, r)
      ctx.arcTo(px, py+cellSize, px, py, r)
      ctx.arcTo(px, py, px+cellSize, py, r)
      ctx.closePath()
      ctx.fill()
      // bordure subtile pour niveau 0 afin qu'il reste visible sur fond identique
      if (level === 0) {
        ctx.strokeStyle = "#30363d"
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }, [cols, rows, cellSize, gap, radius, colors, data])

  useEffect(()=>{ draw() }, [draw])
  useEffect(()=>{ draw() }, [colors])

  const cellFromEvent = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const clientX = (e as React.TouchEvent).touches ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = (e as React.TouchEvent).touches ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY
    const px = clientX - rect.left
    const py = clientY - rect.top
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((px*scaleX)/(cellSize+gap))
    const y = Math.floor((py*scaleY)/(cellSize+gap))
    if (x<0||x>=cols||y<0||y>=rows) return null
    return {x,y}
  }

  const paint = (e: any) => {
    const c = cellFromEvent(e)
    if (!c) return
    setData(prev=>{
      const next = cloneData(prev)
      next[c.x][c.y]=brush
      return next
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    pushUndo()
    isPainting.current=true
    paint(e)
  }
  const handleMouseMove = (e: React.MouseEvent) => { if(isPainting.current) paint(e) }
  const handleMouseUp = () => { isPainting.current=false; draw() }
  useEffect(()=>{
    const up=()=>{ isPainting.current=false }
    window.addEventListener("mouseup", up)
    window.addEventListener("touchend", up)
    return ()=>{ window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up)}
  },[])

  const applySize = () => {
    pushUndo()
    setData(prev=>{
      const nd = makeEmptyData(cols, rows, 0)
      for(let x=0;x<Math.min(prev.length, cols);x++) for(let y=0;y<Math.min(prev[0]?.length??0, rows);y++) nd[x][y]=prev[x][y]
      return nd
    })
  }

  const randomize = () => {
    pushUndo()
    setData(prev=>{
      const nd = cloneData(prev)
      for(let x=0;x<cols;x++) for(let y=0;y<rows;y++) if(nd[x][y]!==-1) nd[x][y]=Math.floor(Math.random()*5)
      return nd
    })
  }

  const reset = () => { pushUndo(); setData(makeEmptyData(cols,rows,0)) }
  const clearDead = () => { pushUndo(); setData(prev=> prev.map(col=> col.map(v=> v===-1?0:v))) }

  const applyTheme = (idx: number) => setColors([...THEMES[idx].colors])

  const exportPng = () => {
    const w = (cols*cellSize + (cols-1)*gap)*exportScale
    const h = (rows*cellSize + (rows-1)*gap)*exportScale
    const off = document.createElement("canvas")
    off.width=w; off.height=h
    const octx = off.getContext("2d")!
    octx.clearRect(0,0,w,h)
    for(let x=0;x<cols;x++) for(let y=0;y<rows;y++){
      const level=data[x][y]
      if(level===-1) continue
      const px=x*(cellSize+gap)*exportScale
      const py=y*(cellSize+gap)*exportScale
      const s=cellSize*exportScale
      const r=radius*exportScale
      octx.fillStyle=colors[level]
      octx.beginPath()
      const rr=Math.min(r,s/2)
      octx.moveTo(px+rr,py)
      octx.arcTo(px+s,py,px+s,py+s,rr)
      octx.arcTo(px+s,py+s,px,py+s,rr)
      octx.arcTo(px,py+s,px,py,rr)
      octx.arcTo(px,py,px+s,py,rr)
      octx.closePath()
      octx.fill()
      if (level === 0) {
        octx.strokeStyle = "#30363d"
        octx.lineWidth = 1 * exportScale
        octx.stroke()
      }
    }
    off.toBlob(blob=>{
      if(!blob) return
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=url; a.download="contribution-graph.png"; a.click()
      URL.revokeObjectURL(url)
    },"image/png")
  }

  const exportSvg = () => {
    const w = cols*cellSize + (cols-1)*gap
    const h = rows*cellSize + (rows-1)*gap
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n`
    for(let x=0;x<cols;x++) for(let y=0;y<rows;y++){
      const level=data[x][y]
      if(level===-1) continue
      const px=x*(cellSize+gap)
      const py=y*(cellSize+gap)
      svg+=`  <rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" rx="${radius}" ry="${radius}" fill="${colors[level]}"${level===0 ? ` stroke="#30363d" stroke-width="1"` : ""} />\n`
    }
    svg+=`</svg>`
    const blob=new Blob([svg],{type:"image/svg+xml"})
    const url=URL.createObjectURL(blob)
    const a=document.createElement("a")
    a.href=url; a.download="contribution-graph.svg"; a.click()
    URL.revokeObjectURL(url)
  }

  const exportJson = () => {
    const payload={ cols, rows, cellSize, gap, radius, colors, data, exportScale, version:2 }
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"})
    const url=URL.createObjectURL(blob)
    const a=document.createElement("a")
    a.href=url; a.download="contribution-graph.json"; a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]
    if(!file) return
    const reader=new FileReader()
    reader.onload=()=>{
      try{
        const p=JSON.parse(reader.result as string)
        if(p.cols) setCols(p.cols)
        if(p.rows) setRows(p.rows)
        if(p.cellSize) setCellSize(p.cellSize)
        if(p.gap!==undefined) setGap(p.gap)
        if(p.radius!==undefined) setRadius(p.radius)
        if(p.colors) setColors(p.colors)
        if(p.data) setData(p.data)
        if(p.exportScale) setExportScale(p.exportScale)
      }catch{ alert("JSON invalide") }
    }
    reader.readAsText(file)
    e.target.value=""
  }

  const applyText = () => {
    const colsData=textToData(textInput, 4)
    if(!colsData) return
    pushUndo()
    const newCols=Math.max(colsData.length, cols)
    const newRows=Math.max(7, rows)
    // center horizontally
    const offsetX=Math.max(0, Math.floor((newCols - colsData.length)/2))
    const nd=makeEmptyData(newCols, newRows, 0)
    // fill with dead background? keep 0
    for(let x=0;x<colsData.length;x++) for(let y=0;y<7;y++){
      const v=colsData[x][y]
      if(v!==-1){
        const tx=offsetX+x
        const ty=y + Math.floor((newRows-7)/2)
        if(tx<newCols && ty<newRows) nd[tx][ty]=v
      }
    }
    setCols(newCols)
    setRows(newRows)
    setData(nd)
  }

  const exportGif = async () => {
    setIsExportingGif(true)
    try{
      const w = cols*cellSize + (cols-1)*gap
      const h = rows*cellSize + (rows-1)*gap
      const frames = gifMode==="draw" ? cols : Math.ceil(gifDuration * gifFps)
      const delay = Math.round(100 / gifFps) // gifenc uses 1/100s
      const gif = GIFEncoder()
      const off=document.createElement("canvas")
      off.width=w; off.height=h
      const octx=off.getContext("2d", { willReadFrequently:true })!

      const drawFrame = (progress: number) => {
        octx.clearRect(0,0,w,h)
        for(let x=0;x<cols;x++) for(let y=0;y<rows;y++){
          let visible=false
          if(gifMode==="draw") visible = x < progress * cols
          else {
            // wave: reveal based on x + y*0.3 + time
            const t = progress * Math.PI * 2
            const wave = Math.sin((x/cols)*Math.PI*2 + t)*0.2 + 0.5
            // simple: all visible but brightness modulated -> we just show all for wave, palette will differ? For simplicity show all
            visible = true
            void wave
          }
          if(!visible) continue
          const level=data[x]?.[y] ?? 0
          if(level===-1) continue
          // wave mode: modulate level with sinus
          let lvl=level
          if(gifMode==="wave"){
            const phase = (x/cols)*Math.PI*4 + progress*Math.PI*4
            const mod = Math.round((Math.sin(phase)+1)*2) // 0..4
            lvl = Math.max(0, Math.min(4, mod))
            if(data[x][y]===0) lvl = Math.round(mod/2)
          }
          const px=x*(cellSize+gap)
          const py=y*(cellSize+gap)
          const r=Math.min(radius, cellSize/2)
          octx.fillStyle=colors[lvl]
          octx.beginPath()
          octx.moveTo(px+r,py)
          octx.arcTo(px+cellSize,py,px+cellSize,py+cellSize,r)
          octx.arcTo(px+cellSize,py+cellSize,px,py+cellSize,r)
          octx.arcTo(px,py+cellSize,px,py,r)
          octx.arcTo(px,py,px+cellSize,py,r)
          octx.closePath()
          octx.fill()
          if (lvl === 0) {
            octx.strokeStyle = "#30363d"
            octx.lineWidth = 1
            octx.stroke()
          }
        }
      }

      for(let f=0; f<frames; f++){
        const progress = frames===1?1:(f/(frames-1))
        drawFrame(progress)
        const dataImg=octx.getImageData(0,0,w,h).data
        const palette=quantize(dataImg, 256)
        const index=applyPalette(dataImg, palette)
        gif.writeFrame(index, w, h, { palette, delay })
      }
      gif.finish()
      const bytes=gif.bytes()
      const blob=new Blob([bytes], {type:"image/gif"})
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=url; a.download="contribution-graph.gif"; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExportingGif(false)
      setShowGifModal(false)
    }
  }

  const copyShareUrl = async () => {
    const payload=btoa(encodeURIComponent(JSON.stringify({c:colors,d:data,co:cols,ro:rows,cs:cellSize,g:gap,r:radius})))
    const url=`${location.origin}${location.pathname}#g=${payload}`
    await navigator.clipboard.writeText(url)
    alert("Lien copié !")
  }

  const importFromGithub = async () => {
    setGhLoading(true); setGhError(null); setGhInfo(null)
    try{
      const res = await fetchGithubContributions(ghUser, ghYear || undefined, ghToken || undefined)
      if (!res.contributions.length) throw new Error("Aucune contribution trouvée pour cet utilisateur/année")
      const ghData = contributionsToData(res.contributions)
      if (!ghData.length) throw new Error("Grille vide")
      pushUndo()
      setCols(ghData.length)
      setRows(7)
      setData(ghData)
      setGhInfo(`${res.username} — ${res.contributions.length} jours • ${res.total ?? res.contributions.reduce((s,c)=>s+c.count,0)} contributions${res.year ? ` (${res.year})` : ""}`)
    }catch(e:any){
      setGhError(e?.message ?? String(e))
    } finally { setGhLoading(false) }
  }

  return (
    <div className="min-h-screen flex flex-col items-center gap-5 p-6">
      <h1 className="text-lg font-semibold text-[#e6edf3]">Générateur de Contribution Graph</h1>

      {/* GitHub import */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-[10px] p-4 w-full max-w-[900px] flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#e6edf3]">Importer depuis GitHub</span>
          <span className="text-[11px] text-[#6e7681]">— reproduit la vraie grille d'un utilisateur</span>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Utilisateur
            <input value={ghUser} onChange={e=>setGhUser(e.target.value)} placeholder="octocat" className="w-36 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[#c9d1d9] text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Année (vide = 12 derniers mois)
            <input value={ghYear} onChange={e=>setGhYear(e.target.value)} placeholder="2024" className="w-28 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[#c9d1d9] text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Token (optionnel, pour privé)
            <input value={ghToken} onChange={e=>setGhToken(e.target.value)} placeholder="ghp_..." type="password" className="w-36 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[#c9d1d9] text-sm" />
          </label>
          <button onClick={importFromGithub} disabled={ghLoading || !ghUser.trim()} className="bg-[#1f6feb] border border-[#388bfd] text-white px-4 py-1.5 rounded-md text-sm hover:bg-[#388bfd] disabled:opacity-40">
            {ghLoading ? "Chargement..." : "Importer"}
          </button>
        </div>
        {ghError && <p className="text-xs text-[#ff7b72] bg-[#ff7b7210] border border-[#ff7b7230] rounded-md px-3 py-2">{ghError}</p>}
        {ghInfo && <p className="text-xs text-[#39d353]">{ghInfo} — tu peux maintenant éditer et exporter en PNG/SVG/GIF</p>}
        <p className="text-[11px] text-[#6e7681]">API publique sans token (cache 24h). Avec token, utilise l'API GraphQL officielle et inclut les contributions privées. Aucun token n'est stocké.</p>
      </div>

      {/* controls */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-[10px] p-4 w-full max-w-[900px] flex flex-col gap-3">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Colonnes<input type="number" value={cols} onChange={e=>setCols(parseInt(e.target.value)||1)} className="w-[70px] bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm" min={1} max={60}/></label>
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Lignes<input type="number" value={rows} onChange={e=>setRows(parseInt(e.target.value)||1)} className="w-[70px] bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm" min={1} max={20}/></label>
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Taille<input type="number" value={cellSize} onChange={e=>setCellSize(parseInt(e.target.value)||4)} className="w-[70px] bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm" min={2} max={40}/></label>
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Gap<input type="number" value={gap} onChange={e=>setGap(parseInt(e.target.value)||0)} className="w-[70px] bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm" min={0} max={20}/></label>
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Radius<input type="number" value={radius} onChange={e=>setRadius(parseInt(e.target.value)||0)} className="w-[70px] bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm" min={0} max={10}/></label>
          <button onClick={applySize} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d]">Appliquer</button>
          <button onClick={copyShareUrl} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d]">Copier lien</button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          {colors.map((c,i)=>(
            <label key={i} className="flex flex-col gap-1 text-xs text-[#8b949e]">Niveau {i}<input type="color" value={c} onChange={e=>{ const n=[...colors]; n[i]=e.target.value; setColors(n)}} className="w-10 h-7 p-0 border border-[#30363d] rounded-md bg-transparent cursor-pointer"/></label>
          ))}
          <div className="flex gap-2 ml-2">
            {THEMES.map((t,idx)=>(
              <button key={t.name} onClick={()=>applyTheme(idx)} title={t.name} className="w-7 h-7 rounded-md border border-[#30363d] flex overflow-hidden">
                {t.colors.slice(1).map(col=><span key={col} style={{background:col}} className="flex-1" />)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[#8b949e]">Pinceau</span>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={()=>setBrush(-1)} title="Zone morte" className={`w-7 h-7 rounded-md border-2 flex items-center justify-center text-xs ${brush===-1 ? "border-[#58a6ff]" : "border-transparent"}`} style={{background: brush===-1? undefined : "#161b22", backgroundImage: "linear-gradient(45deg,#30363d 25%,transparent 25%),linear-gradient(-45deg,#30363d 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#30363d 75%),linear-gradient(-45deg,transparent 75%,#30363d 75%)", backgroundSize:"10px 10px"}}>×</button>
            {colors.map((c,i)=>(
              <button key={i} onClick={()=>setBrush(i)} className={`w-7 h-7 rounded-md border-2 ${brush===i?"border-[#58a6ff]":"border-transparent"}`} style={{background:c}} title={"Niveau "+i}/>
            ))}
          </div>
          <button onClick={randomize} className="ml-2 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d]">Aléatoire</button>
          <button onClick={reset} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d]">Réinitialiser</button>
          <button onClick={clearDead} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d]">Nettoyer morts</button>
          <button onClick={undo} disabled={undoRef.current.length===0} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d] disabled:opacity-40">↶ Undo</button>
          <button onClick={redo} disabled={redoRef.current.length===0} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d] disabled:opacity-40">↷ Redo</button>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Texte → graphe<input value={textInput} onChange={e=>setTextInput(e.target.value)} placeholder="HELLO" className="w-32 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm uppercase"/></label>
          <button onClick={applyText} className="bg-[#1f6feb] border border-[#388bfd] text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#388bfd]">Générer texte</button>
          <span className="text-[11px] text-[#6e7681]">A-Z 0-9 - ! (max ~{Math.floor(cols/6)} chars)</span>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Échelle<input type="number" value={exportScale} onChange={e=>setExportScale(parseInt(e.target.value)||1)} min={1} max={8} className="w-[70px] bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9] text-sm"/></label>
          <button onClick={exportPng} className="bg-[#238636] border border-[#2ea043] text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#2ea043]">PNG transparent</button>
          <button onClick={exportSvg} className="bg-[#238636] border border-[#2ea043] text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#2ea043]">SVG</button>
          <button onClick={()=>setShowGifModal(true)} className="bg-[#8957e5] border border-[#bc8cff] text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#a371f7]">GIF animé</button>
          <button onClick={exportJson} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d]">JSON export</button>
          <label className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm hover:bg-[#30363d] cursor-pointer">JSON import<input type="file" accept=".json" onChange={importJson} className="hidden"/></label>
        </div>
      </div>

      <div className="bg-[#0d1117] border border-[#30363d] rounded-[10px] p-5 overflow-x-auto max-w-[900px] w-full">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={e=>{ pushUndo(); const c=cellFromEvent(e as any); if(c){ setData(p=>{ const n=cloneData(p); n[c.x][c.y]=brush; return n}) } e.preventDefault()}}
          onTouchMove={e=>{ if(isPainting.current) paint(e as any); e.preventDefault()}}
          className="block cursor-crosshair touch-none select-none"
        />
        <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mt-2.5 justify-end">
          <span>Zone morte</span><span className="w-3 h-3 rounded-sm border border-[#30363d]" style={{backgroundImage:"linear-gradient(45deg,#30363d 25%,transparent 25%),linear-gradient(-45deg,#30363d 25%,transparent 25%)"}}/>
          <span className="ml-2">Moins</span>
          {colors.map((c,i)=><span key={i} className="w-3 h-3 rounded-sm" style={{background:c}}/>)}
          <span>Plus</span>
        </div>
      </div>

      <p className="text-[11px] text-[#6e7681] max-w-[900px] text-center">Zone morte = transparente à l'export. Clique ou glisse pour peindre. <span className="text-[#8b949e]">Ctrl+Z Undo / Ctrl+Shift+Z Redo</span></p>

      <footer className="w-full max-w-[900px] mt-2 pt-4 border-t border-[#21262d] flex flex-col gap-2 items-center text-center">
        <p className="text-[11px] leading-relaxed text-[#6e7681]">
          Projet open-source créé par{" "}
          <a href="https://github.com/Hmksenpai" target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] hover:underline font-medium">
            Hmksenpai
          </a>
          {" "}— non affilié à GitHub, Inc. GitHub et le Contribution Graph sont des marques de GitHub, Inc.
        </p>
        <p className="text-[10px] text-[#484f58]">
          Générateur d'images décoratives haute qualité pour designers & portfolios. Aucune donnée GitHub réelle n'est modifiée.
        </p>
      </footer>

      {showGifModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={()=>setShowGifModal(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 w-full max-w-md flex flex-col gap-4" onClick={e=>e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-[#e6edf3]">Exporter GIF animé</h2>
            <label className="flex flex-col gap-1 text-xs text-[#8b949e]">Mode
              <select value={gifMode} onChange={e=>setGifMode(e.target.value as any)} className="bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9]">
                <option value="draw">Draw-on (semaine par semaine)</option>
                <option value="wave">Wave (vague pulsante)</option>
              </select>
            </label>
            <div className="flex gap-4">
              <label className="flex flex-col gap-1 text-xs text-[#8b949e] flex-1">Durée (s)<input type="number" value={gifDuration} onChange={e=>setGifDuration(parseFloat(e.target.value)||1)} min={1} max={10} step={0.5} className="bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9]"/></label>
              <label className="flex flex-col gap-1 text-xs text-[#8b949e] flex-1">FPS<input type="number" value={gifFps} onChange={e=>setGifFps(parseInt(e.target.value)||15)} min={5} max={30} className="bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1 text-[#c9d1d9]"/></label>
            </div>
            <p className="text-[11px] text-[#6e7681]">{gifMode==="draw" ? `${cols} frames (1 par colonne)` : `${Math.ceil(gifDuration*gifFps)} frames`} • {wCalc(cols,cellSize,gap)}×{hCalc(rows,cellSize,gap)}px</p>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setShowGifModal(false)} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 rounded-md text-sm">Annuler</button>
              <button onClick={exportGif} disabled={isExportingGif} className="bg-[#8957e5] border border-[#bc8cff] text-white px-4 py-1.5 rounded-md text-sm disabled:opacity-50">{isExportingGif?"Génération...":"Télécharger GIF"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function wCalc(c:number,s:number,g:number){ return c*s+(c-1)*g }
function hCalc(r:number,s:number,g:number){ return r*s+(r-1)*g }
