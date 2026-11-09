// 彩蛋：MC 风格随机闪烁标语 + 按键序列彩蛋
// 这些内容不出现在更新日志里 —— 彩蛋就该自己被发现

export const SPLASHES = [
  'Also try Terraria!',
  '100% 不含 Herobrine',
  '已经被移除了吗？',
  '试试科乐美秘籍',
  '苦力怕觉得很赞',
  '点击 Logo 有惊喜',
  'Made in China!',
  'Not affiliated with Mojang',
  '现在的版本号很吉利',
  '挖三填一！',
  '不要垂直挖矿',
  '钻石在 Y=-59',
  '附魔台说人话了',
  '猪灵蛮兵还在追我',
  '999 级经验',
  '床已充能',
  '村民：哼！',
  '终末之诗看完了吗',
  'Splash!',
  'Undefined!',
  'Runs on potatoes!',
  'Punch trees, get wood',
  'The cake is a lie!',
  'Creeper? Aww man',
  'Technoblade never dies!',
]

export function randomSplash(avoid) {
  let s = SPLASHES[Math.floor(Math.random() * SPLASHES.length)]
  if (avoid && SPLASHES.length > 1) {
    while (s === avoid) s = SPLASHES[Math.floor(Math.random() * SPLASHES.length)]
  }
  return s
}

// 按键序列检测：在规定时间内按顺序按完目标序列则触发
export function makeSequenceDetector(sequence, onTrigger, windowMs = 3000) {
  let progress = 0
  let lastTime = 0
  return (key) => {
    const now = Date.now()
    if (now - lastTime > windowMs) progress = 0
    lastTime = now
    if (key === sequence[progress]) {
      progress++
      if (progress === sequence.length) {
        progress = 0
        onTrigger()
      }
    } else {
      progress = key === sequence[0] ? 1 : 0
    }
  }
}

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']
export const HEROBRINE = ['h', 'e', 'r', 'o', 'b', 'r', 'i', 'n', 'e']
