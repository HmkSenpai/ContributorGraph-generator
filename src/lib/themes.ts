export type Theme = { name: string; colors: [string,string,string,string,string] }

export const THEMES: Theme[] = [
  { name: "GitHub", colors: ["#161b22","#0e4429","#006d32","#26a641","#39d353"] },
  { name: "Halloween", colors: ["#161b22","#631c03","#8a2a0a","#d95d0f","#ffae33"] },
  { name: "Winter", colors: ["#161b22","#0c2a4a","#0d4a6e","#1f8ad6","#58c4ff"] },
  { name: "Dracula", colors: ["#282a36","#3a3c4e","#6272a4","#bd93f9","#ff79c6"] },
  { name: "Neon", colors: ["#0a0a0f","#1a0533","#4a0a6e","#a020f0","#ff2bd6"] },
  { name: "Forêt", colors: ["#111a12","#1a2e1a","#2d5a27","#4caf50","#a5d6a7"] },
  { name: "Sunset", colors: ["#1a1210","#4a1a0a","#8a2e0a","#e05a1a","#ffb347"] },
]
