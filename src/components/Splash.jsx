import { useEffect, useState } from 'react'
import { randomSplash } from '../utils/easterEggs.js'

// MC 标题画面风格的黄色闪烁标语（斜体 + 脉动缩放）
export default function Splash() {
  const [text, setText] = useState(() => randomSplash())
  useEffect(() => {
    const t = setInterval(() => setText((cur) => randomSplash(cur)), 10000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      <span className="mc-splash" onClick={() => setText((cur) => randomSplash(cur))} title="？">{text}</span>
      <style>{`
        .mc-splash {
          position: absolute;
          right: 8px;
          bottom: 4px;
          color: #ffff54;
          font-weight: 700;
          font-size: 15px;
          transform: rotate(-18deg);
          transform-origin: center;
          text-shadow: 2px 2px 0 rgba(0,0,0,0.45);
          user-select: none;
          cursor: pointer;
          pointer-events: auto;
          animation: mc-splash-pulse 0.55s ease-in-out infinite alternate;
          white-space: nowrap;
          z-index: 3;
        }
        @keyframes mc-splash-pulse {
          from { scale: 1; }
          to { scale: 1.09; }
        }
      `}</style>
    </>
  )
}
