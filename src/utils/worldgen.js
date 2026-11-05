// 世界生成核心：1.18+ multi-noise 群系采样（cubiomes 算法移植，与游戏逐点一致）、
// 结构 region-grid 定位（LegacyRandom / Java LCG）、史莱姆区块判定
// 采样链：Xoroshiro 播种 → 按名 md5 hash 播种 → DoublePerlin（cubiomes xDoublePerlinInit 公式）
// 群系表：biomeParams.js（cubiomes 二分搜索树 + 群系颜色/中文名）
import { XoroshiroRandom, LegacyRandom, PerlinNoise } from 'deepslate/math'
import { BIOME_TABLES, BIOME_INFO, BIOME_FALLBACK, tableForVersion } from './biomeParams.js'

// ---------------- DoublePerlin（cubiomes xDoublePerlinInit / sampleDoublePerlin 移植） ----------------
const INPUT_FACTOR = 337.0 / 331.0 // 双层噪声第二组的频率倍率（vanilla 常量 1.0181268882175227）

function makeDoublePerlin(posRandom, name, omin, amplitudes) {
  const named = posRandom.fromHashOf(name)
  const halfA = named.forkPositional() // 每个 half 消耗 2 个 nextLong（与 cubiomes xOctaveInit 一致）
  const halfB = named.forkPositional()
  const len = amplitudes.length
  let persist = Math.pow(2, len - 1) / (Math.pow(2, len) - 1) // cubiomes persist_ini[len]
  let lacuna = Math.pow(2, omin)
  const octaves = []
  for (let i = 0; i < len; i++) {
    if (amplitudes[i] !== 0) {
      octaves.push({
        a: new PerlinNoise(halfA.fromHashOf('octave_' + (omin + i))),
        b: new PerlinNoise(halfB.fromHashOf('octave_' + (omin + i))),
        amp: amplitudes[i] * persist,
        lac: lacuna,
      })
    }
    lacuna *= 2
    persist *= 0.5
  }
  // 首尾零幅八度裁剪后的有效长度决定总幅值系数 amp_ini = (5/3)·m/(m+1)
  let m = len
  while (m > 0 && amplitudes[m - 1] === 0) m--
  let head = 0
  while (head < m && amplitudes[head] === 0) { head++; m-- }
  const ampTotal = (5 / 3) * (m / (m + 1))
  return {
    sample(x, y, z) {
      let v = 0
      for (let i = 0; i < octaves.length; i++) {
        const o = octaves[i]
        const lx = x * o.lac, ly = y * o.lac, lz = z * o.lac
        v += o.amp * (o.a.get3D(lx, ly, lz) +
                      o.b.get3D(lx * INPUT_FACTOR, ly * INPUT_FACTOR, lz * INPUT_FACTOR))
      }
      return v * ampTotal
    },
  }
}

// 1.18 ~ 1.21.x 全版本一致的 overworld 气候噪声参数（mcmeta worldgen/noise + cubiomes init_climate_seed 验证）
const NOISE_PARAMS = {
  shift:           { name: 'minecraft:offset',          omin: -3,  amp: [1, 1, 1, 0] },
  temperature:     { name: 'minecraft:temperature',     omin: -10, amp: [1.5, 0, 1, 0, 0, 0] },
  humidity:        { name: 'minecraft:vegetation',      omin: -8,  amp: [1, 1, 0, 0, 0, 0] },
  continentalness: { name: 'minecraft:continentalness', omin: -9,  amp: [1, 1, 2, 2, 2, 1, 1, 1, 1] },
  erosion:         { name: 'minecraft:erosion',         omin: -9,  amp: [1, 1, 0, 1, 1] },
  weirdness:       { name: 'minecraft:ridge',           omin: -7,  amp: [1, 2, 1, 0, 0, 0] },
}

// ---------------- 群系搜索树（cubiomes climateToBiome 移植） ----------------
const tableCache = new Map()

function decodeTable(key) {
  let t = tableCache.get(key)
  if (t) return t
  const raw = BIOME_TABLES[key]
  const pbin = atob(raw.params)
  const pu8 = new Uint8Array(pbin.length)
  for (let i = 0; i < pbin.length; i++) pu8[i] = pbin.charCodeAt(i)
  const nbin = atob(raw.nodes)
  const nu8 = new Uint8Array(nbin.length)
  for (let i = 0; i < nbin.length; i++) nu8[i] = nbin.charCodeAt(i)
  t = { steps: raw.steps, order: raw.order, len: raw.len, params: new Int32Array(pu8.buffer), nodes: nu8 }
  tableCache.set(key, t)
  return t
}

// 6 维平方距离（点 np 到节点参数区间的距离，cubiomes get_np_dist）
function npDist(np, table, idx) {
  const nodes = table.nodes, params = table.params
  const base = idx * 8
  let ds = 0
  for (let i = 0; i < 6; i++) {
    const pi = nodes[base + i] * 2
    const a = np[i] - params[pi + 1]
    const b = params[pi] - np[i]
    const d = a > 0 ? a : b > 0 ? b : 0
    ds += d * d
  }
  return ds
}

// cubiomes get_resulting_node：沿树下降找最近叶节点
function resultingNode(np, table, idx, alt, ds, depth) {
  if (table.steps[depth] === 0) return idx
  let step
  do {
    step = table.steps[depth]
    depth++
  } while (idx + step >= table.len)
  let inner = table.nodes[idx * 8 + 6] | (table.nodes[idx * 8 + 7] << 8)
  let leaf = alt
  for (let i = 0, n = table.order; i < n; i++) {
    const dsInner = npDist(np, table, inner)
    if (dsInner < ds) {
      const leaf2 = resultingNode(np, table, inner, leaf, ds, depth)
      const dsLeaf2 = inner === leaf2 ? dsInner : npDist(np, table, leaf2)
      if (dsLeaf2 < ds) {
        ds = dsLeaf2
        leaf = leaf2
      }
    }
    inner += step
    if (inner >= table.len) break
  }
  return leaf
}

// ---------------- 气候采样 ----------------
export function createClimate(seed, version) {
  const worldSeed = BigInt.asIntN(64, BigInt(seed))
  const root = XoroshiroRandom.create(worldSeed).forkPositional()
  const climate = { seed: worldSeed, version, tableKey: tableForVersion(version) }
  climate.table = decodeTable(climate.tableKey)
  for (const k of Object.keys(NOISE_PARAMS)) {
    const p = NOISE_PARAMS[k]
    climate[k] = makeDoublePerlin(root, p.name, p.omin, p.amp)
  }
  return climate
}

// 采样某方块坐标的气候点（1:4 quart 分辨率；shift 偏移后采样，与 cubiomes sampleBiomeNoise 一致）
export function sampleClimateValues(climate, x, z) {
  const qx = Math.floor(x / 4)
  const qz = Math.floor(z / 4)
  const px = qx + climate.shift.sample(qx, 0, qz) * 4
  const pz = qz + climate.shift.sample(qz, qx, 0) * 4 // 注意 pz 的参数交换（z, x, 0）
  return {
    t: Math.fround(climate.temperature.sample(px, 0, pz)),
    h: Math.fround(climate.humidity.sample(px, 0, pz)),
    c: Math.fround(climate.continentalness.sample(px, 0, pz)),
    e: Math.fround(climate.erosion.sample(px, 0, pz)),
    w: Math.fround(climate.weirdness.sample(px, 0, pz)),
  }
}

// cubiomes 量化：(int64_t)(10000.0F * v)——v 已是 float 值，乘积在 double 下精确，向零截断
function quantize(v) { return Math.trunc(10000 * v) }

function valuesToNp(v) {
  return [quantize(v.t), quantize(v.h), quantize(v.c), quantize(v.e), 0, quantize(v.w)]
}

// 数字群系 id（渲染热路径用）
export function getBiomeIdAt(climate, x, z) {
  const np = valuesToNp(sampleClimateValues(climate, x, z))
  const idx = resultingNode(np, climate.table, 0, 0, Infinity, 0)
  return climate.table.nodes[idx * 8 + 6]
}

// 完整群系信息 + 气候值（悬停信息、结构群系过滤用）
export function getBiomeAt(climate, x, z) {
  const v = sampleClimateValues(climate, x, z)
  const idx = resultingNode(valuesToNp(v), climate.table, 0, 0, Infinity, 0)
  const biomeId = climate.table.nodes[idx * 8 + 6]
  const info = BIOME_INFO[biomeId] || BIOME_FALLBACK
  return { biomeId, id: info.id, name: info.name, color: info.color, climate: v }
}

// ---------------- 结构定位（1.18+ region-grid，LegacyRandom / Java LCG） ----------------
// 参数来自 mcmeta worldgen/structure_set（spacing/separation/salt/spread_type/frequency）+ vanilla 群系 tag
export const STRUCTURE_TYPES = {
  village: {
    name: '村庄', spacing: 34, separation: 8, salt: 10387312, spread: 'linear',
    biomes: ['plains', 'meadow', 'desert', 'savanna', 'snowy_plains', 'taiga'],
  },
  pillager_outpost: {
    name: '掠夺者前哨站', spacing: 32, separation: 8, salt: 165745296, spread: 'linear',
    frequency: 0.2, exclusion: { other: 'village', chunks: 10 },
    biomes: ['plains', 'meadow', 'desert', 'savanna', 'snowy_plains', 'taiga', 'grove'],
  },
  desert_pyramid: {
    name: '沙漠神殿', spacing: 32, separation: 8, salt: 14357617, spread: 'linear',
    biomes: ['desert'],
  },
  jungle_pyramid: {
    name: '丛林神殿', spacing: 32, separation: 8, salt: 14357619, spread: 'linear',
    biomes: ['jungle', 'bamboo_jungle'],
  },
  swamp_hut: {
    name: '沼泽小屋', spacing: 32, separation: 8, salt: 14357620, spread: 'linear',
    biomes: ['swamp'],
  },
  igloo: {
    name: '雪屋', spacing: 32, separation: 8, salt: 14357618, spread: 'linear',
    biomes: ['snowy_plains', 'snowy_taiga', 'snowy_slopes'],
  },
  monument: {
    name: '海底神殿', spacing: 32, separation: 5, salt: 10387313, spread: 'triangular',
    biomes: ['deep_ocean', 'deep_frozen_ocean', 'deep_cold_ocean', 'deep_lukewarm_ocean'],
  },
  mansion: {
    name: '林地府邸', spacing: 80, separation: 20, salt: 10387319, spread: 'triangular',
    biomes: ['dark_forest', 'pale_garden'],
  },
}

// region 内候选区块（不做频率/群系检查）
function regionCandidate(cfg, seed, rx, rz) {
  const random = LegacyRandom.fromLargeFeatureWithSalt(seed, rx, rz, cfg.salt)
  const m = cfg.spacing - cfg.separation
  let offX, offZ
  if (cfg.spread === 'triangular') {
    offX = Math.floor((random.nextInt(m) + random.nextInt(m)) / 2)
    offZ = Math.floor((random.nextInt(m) + random.nextInt(m)) / 2)
  } else {
    offX = random.nextInt(m)
    offZ = random.nextInt(m)
  }
  return [rx * cfg.spacing + offX, rz * cfg.spacing + offZ]
}

// 前哨站 legacy_type_1 频率判定（StructurePlacement.FrequencyReducer.LegacyPillagerOutpostReducer）
function legacyOutpostFrequency(seed, cx, cz, frequency) {
  const a = cx >> 4, b = cz >> 4
  const random = new LegacyRandom(BigInt(a ^ (b << 4)) ^ seed)
  random.nextInt()
  return random.nextInt(Math.floor(1 / frequency)) === 0
}

// 排斥区检查：半径 n 区块内存在 other 结构的候选区块则禁止生成
function inExclusionZone(cfg, seed, cx, cz) {
  const v = STRUCTURE_TYPES[cfg.exclusion.other]
  const n = cfg.exclusion.chunks
  for (let vx = Math.floor((cx - n) / v.spacing); vx * v.spacing <= cx + n; vx++) {
    for (let vz = Math.floor((cz - n) / v.spacing); vz * v.spacing <= cz + n; vz++) {
      const [vcx, vcz] = regionCandidate(v, seed, vx, vz)
      if (Math.abs(vcx - cx) <= n && Math.abs(vcz - cz) <= n) return true
    }
  }
  return false
}

// 查找方块坐标范围内的结构；type 为 STRUCTURE_TYPES 的 key
export function findStructures(climate, type, minX, minZ, maxX, maxZ) {
  const cfg = STRUCTURE_TYPES[type]
  if (!cfg) return []
  if (!cfg._biomeSet) cfg._biomeSet = new Set(cfg.biomes)
  const minCX = Math.floor(minX / 16), maxCX = Math.floor(maxX / 16)
  const minCZ = Math.floor(minZ / 16), maxCZ = Math.floor(maxZ / 16)
  const out = []
  for (let rx = Math.floor(minCX / cfg.spacing); rx * cfg.spacing <= maxCX; rx++) {
    for (let rz = Math.floor(minCZ / cfg.spacing); rz * cfg.spacing <= maxCZ; rz++) {
      const [cx, cz] = regionCandidate(cfg, climate.seed, rx, rz)
      if (cx < minCX || cx > maxCX || cz < minCZ || cz > maxCZ) continue
      if (cfg.frequency !== undefined && !legacyOutpostFrequency(climate.seed, cx, cz, cfg.frequency)) continue
      if (cfg.exclusion && inExclusionZone(cfg, climate.seed, cx, cz)) continue
      // 群系过滤：结构尝试点位于区块中心 (cx*16+8, cz*16+8)
      const info = getBiomeAt(climate, cx * 16 + 8, cz * 16 + 8)
      if (!cfg._biomeSet.has(info.id)) continue
      out.push({ x: cx * 16 + 8, z: cz * 16 + 8, cx, cz })
    }
  }
  return out
}

// ---------------- 史莱姆区块（全版本一致的 Java Random 算法） ----------------
const MASK48 = (1n << 48n) - 1n
const RND_MULT = 0x5DEECE66Dn
const RND_ADD = 0xBn

export function isSlimeChunk(worldSeed, x, z) {
  const xs = BigInt(x)
  const zs = BigInt(z)
  const sum = worldSeed + xs * xs * 4987142n + xs * 5947611n + zs * zs * 4392871n + zs * 389711n
  let state = ((BigInt.asIntN(64, sum) ^ 987234911n) ^ RND_MULT) & MASK48
  for (;;) {
    state = (state * RND_MULT + RND_ADD) & MASK48
    const bits = Number(state >> 17n) // next(31)
    const val = bits % 10
    if (bits - val + 9 >= 0) return val === 0
  }
}
