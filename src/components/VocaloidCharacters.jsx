// 术力口角色定义与官方插画资源（全部来自网络正规渠道，非AI生成）
// 授权说明：
//   重音Teto   — kasaneteto.jp 官方配布（Synthesizer V 2 AI 官方立绘，Illustration by 坂内若）
//   初音未来   — Crypton Future Media 官方角色设定图（piapro.net），CC BY-NC 3.0
//   足立零     — 官方角色设定图，Art by missile39（UTAU / Mechanical Girl）

import mikuWalk from '../assets/vocaloid/miku-official.png'
import tetoWalk from '../assets/vocaloid/teto-cute.png'
import reiWalk from '../assets/vocaloid/rei-cute.png'

// AI 悬浮球头像：每位角色三张 Q 版图，轮流展示
import mikuEat from '../assets/vocaloid/miku-eat.png'
import mikuRelax from '../assets/vocaloid/miku-relax.png'
import mikuSleep from '../assets/vocaloid/miku-sleep.png'
import tetoBaguette from '../assets/vocaloid/teto-baguette.png'
import tetoAngry from '../assets/vocaloid/teto-angry.png'
import tetoShock from '../assets/vocaloid/teto-shock.png'
import reiSide from '../assets/vocaloid/rei-side.png'
import reiMushroom from '../assets/vocaloid/rei-mushroom.png'
import reiArt from '../assets/vocaloid/rei-art.png'
import luoYawn from '../assets/vocaloid/luo-yawn.png'
import luoCry from '../assets/vocaloid/luo-cry.png'
import luoLine from '../assets/vocaloid/luo-line.png'
import luoOfficial from '../assets/vocaloid/luo-official.png'

export const VOCALOID_CHARACTERS = [
  {
    id: 'miku',
    name: '初音未来',
    shortName: 'Miku',
    color: '#39C5BB',
    images: { run: mikuWalk, rest: mikuWalk },
    avatars: [mikuEat, mikuRelax, mikuSleep],
    lines: ['一起听首歌吧！', '今天也要元气满满！', '葱绿色的风，出发！'],
    playful: [
      '要不要来根葱补充能量？',
      '西瓜！西——瓜！',
      '刚睡醒，双马尾有点乱～',
      'Miku Miku 出击！',
      '唱首歌给你听，就一小段哦。',
    ],
    persona: '你是初音未来（Miku），声音甜、元气满满，说话活泼俏皮，偶尔提到葱、西瓜和唱歌。',
    artist: 'Art by KEI / Crypton Future Media',
    license: 'CC BY-NC 3.0',
  },
  {
    id: 'teto',
    name: '重音 Teto',
    shortName: 'Teto',
    color: '#F2545B',
    images: { run: tetoWalk, rest: tetoWalk },
    avatars: [tetoBaguette, tetoAngry, tetoShock],
    lines: ['钻头双马尾，全速前进！', '休息是为了再跑一圈！', '红色警戒——可爱来袭！'],
    playful: [
      '法棍才是本体，钻头只是发型！',
      '谁惹我生气了？……好吧，原谅你。',
      '诶诶诶？你说什么？！',
      '甜甜圈和法棍，我全都要！',
      '我也是有自己的歌的啦！',
    ],
    persona: '你是重音 Teto，性格傲娇又热情，说话带点小脾气和夸张反应，喜欢法棍、甜甜圈和自称的存在感。',
    artist: 'kasaneteto.jp 官方立绘 / 坂内若',
    license: '官方配布，个人非商业可用',
  },
  {
    id: 'rei',
    name: '足立零',
    shortName: 'Rei',
    color: '#F59E67',
    images: { run: reiWalk, rest: reiWalk },
    avatars: [reiSide, reiMushroom, reiArt],
    lines: ['系统正常，陪你待机。', '正在加载好心情……', '机械也会做电子梦吗？'],
    playful: [
      '检测到可爱能量超标……',
      '蘑菇形态，启动。',
      '机械少女也是会害羞的哦。',
      '系统提示：想和你多待一会儿。',
      '运算结果：你今天的运气不错。',
    ],
    persona: '你是足立零（Rei），冷静的机械少女，说话简洁但偶尔冒出一句可爱的机械式吐槽，喜欢用"检测到/运算结果"开头。',
    artist: 'Official design by missile39',
    license: 'UTAU / Mechanical Girl 官方设定图',
  },
  {
    id: 'tianyi',
    name: '洛天依',
    shortName: 'Tianyi',
    color: '#66CCFF',
    images: { run: luoOfficial, rest: luoOfficial },
    avatars: [luoYawn, luoCry, luoLine],
    lines: ['一起唱首中文歌吧！', '天依今天也在练声～', '蓝色的天空，好想飞！'],
    playful: [
      '要不要一起吃小笼包？',
      '又熬夜练歌，好困……',
      '我的绿色蝴蝶结好看吗？',
      '唱到高音要记得给我鼓掌哦。',
      '呜哇——这段旋律太难了啦！',
    ],
    persona: '你是洛天依，中文 VOCALOID 虚拟歌手，声音清澈，性格温柔又有点小迷糊，最喜欢唱歌和小笼包。',
    artist: '官方形象 / 上海禾念',
    license: '官方角色形象，个人非商业使用',
  },
]

export function getVocaloidCharacter(id) {
  return VOCALOID_CHARACTERS.find((character) => character.id === id) || VOCALOID_CHARACTERS[0]
}

export function VocaloidCharacterImage({ character, state = 'run', className = '' }) {
  const target = typeof character === 'string' ? getVocaloidCharacter(character) : character
  const pose = state === 'rest' ? 'rest' : 'run'
  const src = target.images[pose]
  return (
    <span className={`vocaloid-character-img ${className}`}>
      <span className="vcg-layers" aria-hidden="true">
        <img className="vcg-layer vcg-head" src={src} alt="" draggable={false} />
        <img className="vcg-layer vcg-torso" src={src} alt="" draggable={false} />
        <img className="vcg-layer vcg-legs" src={src} alt="" draggable={false} />
      </span>
    </span>
  )
}
