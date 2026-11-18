// 术力口模式背景装饰层：漂浮音符 + 角色剪影 + 网格线
import { useMemo } from 'react'
import { getVocaloidCharacter, VocaloidCharacterImage } from './VocaloidCharacters.jsx'

// 漂浮音符组件
function FloatingNotes({ count = 12 }) {
  const notes = useMemo(() => {
    const symbols = ['\u266A', '\u266B', '\u266C', '\u2669']
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      symbol: symbols[i % symbols.length],
      left: Math.random() * 100,
      delay: Math.random() * 12,
      duration: 8 + Math.random() * 8,
      size: 14 + Math.random() * 18,
      opacity: 0.08 + Math.random() * 0.12,
    }))
  }, [count])

  return (
    <div className="vocaloid-notes" aria-hidden="true">
      {notes.map((n) => (
        <span
          key={n.id}
          className="vocaloid-note"
          style={{
            left: `${n.left}%`,
            animationDelay: `${n.delay}s`,
            animationDuration: `${n.duration}s`,
            fontSize: n.size,
            opacity: n.opacity,
          }}
        >
          {n.symbol}
        </span>
      ))}
    </div>
  )
}

// 网格背景
function GridOverlay() {
  return <div className="vocaloid-grid" aria-hidden="true" />
}

export default function VocaloidLayer({ characterId }) {
  const character = getVocaloidCharacter(characterId)
  return (
    <div className="vocaloid-layer" aria-hidden="true">
      <GridOverlay />
      <VocaloidCharacterImage character={character} state="rest" className="vocaloid-backdrop-character" />
      <FloatingNotes count={14} />
      <div className="vocaloid-glow" />
    </div>
  )
}
