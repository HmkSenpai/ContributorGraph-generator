export type GhDay = { date: string; count: number; level: number }

export type FetchResult = {
  username: string
  year?: string
  contributions: GhDay[]
  total?: number
}

function levelFromCount(count: number): number {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

// Try jogruber API v4, fallback to rschristian
export async function fetchGithubContributions(username: string, year?: string, token?: string): Promise<FetchResult> {
  const clean = username.trim().replace(/^@/, "")
  if (!clean) throw new Error("Nom d'utilisateur vide")
  if (token) {
    return fetchViaGraphQL(clean, year, token)
  }
  // Try jogruber first
  try {
    return await fetchViaJogruber(clean, year)
  } catch (e) {
    // fallback to rschristian
    return await fetchViaRschristian(clean, year)
  }
}

async function fetchViaJogruber(username: string, year?: string): Promise<FetchResult> {
  // docs: https://github.com/grubersjoe/github-contributions-api
  // endpoint: https://github-contributions-api.jogruber.de/v4/{username}?y=last or y=2024
  const y = year ? year : "last"
  const url = `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=${encodeURIComponent(y)}`
  const res = await fetch(url)
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`GitHub API (jogruber) ${res.status}: ${txt.slice(0,200)}`)
  }
  const data = await res.json()
  // v4 shape: { total: {2024: 123, 2023: ...}, contributions: [{date, count, level}] }  OR { contributions: [...] }
  let contributions: GhDay[] = []
  if (Array.isArray(data.contributions)) {
    contributions = data.contributions.map((c: any) => ({
      date: c.date,
      count: c.count ?? c.contributionCount ?? 0,
      level: typeof c.level === "number" ? c.level : levelFromCount(c.count ?? 0),
    }))
  } else if (Array.isArray(data)) {
    contributions = data.map((c: any) => ({
      date: c.date,
      count: c.count ?? 0,
      level: typeof c.level === "number" ? c.level : levelFromCount(c.count ?? 0),
    }))
  } else {
    throw new Error("Format API inattendu (jogruber)")
  }
  // filter by year if needed
  if (year && /^\d{4}$/.test(year)) {
    contributions = contributions.filter(c => c.date.startsWith(year))
  }
  return { username, year, contributions, total: contributions.reduce((s,c)=>s+c.count,0) }
}

async function fetchViaRschristian(username: string, year?: string): Promise<FetchResult> {
  const url = `https://gh-calendar.rschristian.dev/user/${encodeURIComponent(username)}${year ? `?year=${encodeURIComponent(year)}` : ""}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GitHub API (rschristian) ${res.status}`)
  const data = await res.json()
  // shape: { contributions: [{date, count, level}], total, ... } OR { contributions: [...] }
  let contributions: GhDay[] = []
  if (Array.isArray(data.contributions)) contributions = data.contributions
  else if (Array.isArray(data)) contributions = data
  else if (data.weeks) {
    // alternative shape weeks -> flatten
    contributions = data.weeks.flatMap((w:any)=> w.contributionDays ?? w.contribution_days ?? [])
      .map((d:any)=> ({ date: d.date, count: d.contributionCount ?? d.count ?? 0, level: d.contributionLevel ?? levelFromCount(d.contributionCount ?? 0)}))
  }
  contributions = contributions.map(c=> ({
    date: c.date,
    count: c.count ?? 0,
    level: typeof (c as any).level === "number" ? (c as any).level : levelFromCount(c.count ?? 0)
  }))
  if (year && /^\d{4}$/.test(year)) contributions = contributions.filter(c=> c.date.startsWith(year))
  return { username, year, contributions, total: data.total ?? contributions.reduce((s,c)=>s+c.count,0) }
}

async function fetchViaGraphQL(username: string, year: string | undefined, token: string): Promise<FetchResult> {
  const now = new Date()
  const y = year ? parseInt(year,10) : now.getUTCFullYear()
  const from = `${y}-01-01T00:00:00Z`
  const to = `${y}-12-31T23:59:59Z`
  const query = `query($login:String!, $from:DateTime!, $to:DateTime!){
    user(login:$login){
      contributionsCollection(from:$from, to:$to){
        contributionCalendar{
          totalContributions
          weeks{ contributionDays{ date contributionCount contributionLevel } }
        }
      }
    }
  }`
  const res = await fetch("https://api.github.com/graphql", {
    method:"POST",
    headers:{ "Authorization": `bearer ${token}`, "Content-Type":"application/json" },
    body: JSON.stringify({ query, variables:{ login: username, from, to }})
  })
  if (!res.ok) throw new Error(`GraphQL ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message ?? "GraphQL error")
  const weeks = json.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? []
  const contributions: GhDay[] = weeks.flatMap((w:any)=> w.contributionDays.map((d:any)=> ({
    date: d.date,
    count: d.contributionCount,
    level: d.contributionLevel === "NONE" ? 0 : d.contributionLevel === "FIRST_QUARTILE" ? 1 : d.contributionLevel === "SECOND_QUARTILE" ? 2 : d.contributionLevel === "THIRD_QUARTILE" ? 3 : 4
  })))
  const total = json.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions
  return { username, year: String(y), contributions, total }
}

// Convert flat contributions -> Data (cols x 7 rows, Sun=0)
export function contributionsToData(contributions: GhDay[]): number[][] {
  if (!contributions.length) return []
  // sort by date asc
  const sorted = [...contributions].sort((a,b)=> a.date.localeCompare(b.date))
  // chunk by 7, aligned on Sunday. We use date.getDay() to pad correctly.
  const cols: number[][] = []
  let cur: number[] = []
  // pad leading days if first date not Sunday
  const firstDay = new Date(sorted[0].date + "T12:00:00Z").getUTCDay() // 0 Sun
  for (let i=0;i<firstDay;i++) cur.push(0)
  for (const c of sorted) {
    cur.push(c.level)
    if (cur.length === 7) {
      cols.push(cur)
      cur = []
    }
  }
  if (cur.length) {
    while(cur.length < 7) cur.push(0)
    cols.push(cur)
  }
  return cols
}
