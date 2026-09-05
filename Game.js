// Physics and rules ported from Ostrich Riders (GPL-3.0-or-later).
// Numbers come from data/mods/standard/constants.dat and src/joust/Constants.h.

var TILE = 32
var MAP_W = 32
var MAP_H = 22
var WIDTH = MAP_W * TILE
var HEIGHT = MAP_H * TILE

var EMPTY = 0
var LAVA = 1
var SOLID = 2
var GATE = 3

var JOUSTER_W = 64
var JOUSTER_H = 64
var BB_LEFT = 22
var BB_RIGHT = 22
var BB_TOP = 4
var BB_BOTTOM = 31
var KILL_DIST = 8

var WEIGHT = 390
var JUMP = -180
var HIT_JUMP = -95
var MAX_Y = 400
var SPEEDS = [55, 110, 165, 220, 275]
var SPEED_MAX = 5
var DELAY_WALK = 0.13
var DELAY_BRAKE = 0.08
var DELAY_FLY = 0.13
var DELAY_AIR_BRAKE = 0.08
var JUMP_DELAY = 0.25
var LATENCY = 0.5
var BOT_DELAY = 1.0
var REBORN_DELAY = 2.0
var EGG_VISCOSITY = 0.985
var EGG_INCUBATE_MIN = 8
var EGG_INCUBATE_MAX = 16
var INITIAL_LIVES = 4
var LIFE_UP = 40000
var LEVEL_TIME = 80
var LEVEL_TIME_BONUS = 4000
var BOT_SCORE = [500, 750, 1000, 1500]
var EGG_SCORE = [100, 200, 400, 600]
var COMBO_MAX = 4
var MULTIKILL_DELAY = 1.5

var LEVELS = []

function setLevels(maps) {
  LEVELS = maps || []
}

function getLevels() {
  if (LEVELS.length) return LEVELS
  if (typeof MAPS !== "undefined") return MAPS
  if (typeof require !== "undefined") {
    try {
      LEVELS = require("./Levels.js").MAPS
      return LEVELS
    } catch (error) {
      return []
    }
  }
  return []
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function rand01(rand) {
  var n = typeof rand === "function" ? rand() : Math.random()
  if (!isFinite(n)) return 0.5
  return Math.max(0, Math.min(0.999999, n))
}

function emptyEvents() {
  return {
    flap: false,
    wall: false,
    hit: false,
    kill: false,
    egg: false,
    hatch: false,
    burn: false,
    gate: false,
    die: false,
    wave: false,
    lifeUp: false
  }
}

function tileAt(tiles, tx, ty) {
  if (ty < 0 || tx < 0 || ty >= MAP_H || tx >= MAP_W) return EMPTY
  return tiles[ty][tx]
}

function isBlocking(kind) {
  return kind === SOLID || kind === GATE
}

function jousterBox(e) {
  return {
    left: e.x - BB_LEFT,
    right: e.x + BB_RIGHT,
    top: e.y - BB_TOP,
    bottom: e.y + BB_BOTTOM
  }
}

function eggBox(e) {
  return {
    left: e.x - 8,
    right: e.x + 8,
    top: e.y - 8,
    bottom: e.y + 8
  }
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function xRange(box) {
  return {
    x0: Math.floor(box.left / TILE),
    x1: Math.floor((box.right - 0.001) / TILE)
  }
}

function yRange(box) {
  return {
    y0: Math.floor(box.top / TILE),
    y1: Math.floor((box.bottom - 0.001) / TILE)
  }
}

function blockedOn(tiles, box, dir) {
  var xs = xRange(box)
  var ys = yRange(box)
  var tx, ty
  if (dir === "right") {
    tx = xs.x1
    for (ty = Math.max(0, ys.y0); ty <= ys.y1; ty++) {
      if (isBlocking(tileAt(tiles, tx, ty))) return true
    }
    return false
  }
  if (dir === "left") {
    tx = xs.x0
    for (ty = Math.max(0, ys.y0); ty <= ys.y1; ty++) {
      if (isBlocking(tileAt(tiles, tx, ty))) return true
    }
    return false
  }
  if (dir === "down") {
    ty = ys.y1
    if (ty < 0) return false
    for (tx = xs.x0; tx <= xs.x1; tx++) {
      if (isBlocking(tileAt(tiles, tx, ty))) return true
    }
    return false
  }
  if (box.top < 0) return true
  ty = ys.y0
  for (tx = xs.x0; tx <= xs.x1; tx++) {
    if (isBlocking(tileAt(tiles, tx, ty))) return true
  }
  return false
}

function pushOut(e, axis, step, blocked) {
  var n = 0
  while (n < 64 && blocked()) {
    if (axis === "x") e.x += step
    else e.y += step
    n++
  }
  return n < 64
}

function overlapsTiles(tiles, box, predicate) {
  var xs = xRange(box)
  var ys = yRange(box)
  for (var ty = Math.max(0, ys.y0); ty <= ys.y1; ty++) {
    for (var tx = xs.x0; tx <= xs.x1; tx++) {
      if (predicate(tileAt(tiles, tx, ty), tx, ty)) return true
    }
  }
  return false
}

function onGround(tiles, e) {
  var box = jousterBox(e)
  var xs = xRange(box)
  var ty = Math.floor((box.bottom + 1) / TILE)
  if (ty < 0) return false
  for (var tx = xs.x0; tx <= xs.x1; tx++) {
    if (isBlocking(tileAt(tiles, tx, ty))) return true
  }
  return false
}

function inLava(tiles, e, isEgg) {
  var box = isEgg ? eggBox(e) : jousterBox(e)
  if (box.bottom >= HEIGHT - TILE + 4) return true
  return overlapsTiles(tiles, box, function(kind) { return kind === LAVA })
}

function setSpeed(e, speed) {
  e.speed = speed
  e.speedDelay = 0
  if (speed === 0) e.vx = 0
  else if (speed > 0) e.vx = SPEEDS[speed - 1]
  else e.vx = -SPEEDS[-speed - 1]
}

function applyMoveIntent(e, grounded, dt) {
  e.speedDelay += dt
  var walkDelay = grounded ? DELAY_WALK : DELAY_FLY
  var brakeDelay = grounded ? DELAY_BRAKE : DELAY_AIR_BRAKE
  if (e.wannaRight) {
    if (e.speed > 1 && e.speed < SPEED_MAX) {
      if (e.speedDelay >= walkDelay) setSpeed(e, e.speed + 1)
    } else if (e.speed <= 1) {
      if (e.speedDelay >= brakeDelay) setSpeed(e, e.speed + 1)
    }
  }
  if (e.wannaLeft) {
    if (e.speed < -1 && e.speed > -SPEED_MAX) {
      if (e.speedDelay >= walkDelay) setSpeed(e, e.speed - 1)
    } else if (e.speed >= -1) {
      if (e.speedDelay >= brakeDelay) setSpeed(e, e.speed - 1)
    }
  }
}

function collideX(tiles, e, events) {
  if (e.vx > 0 && blockedOn(tiles, jousterBox(e), "right")) {
    if (Math.abs(e.speed) >= 2 && events) events.wall = true
    if (e.speed > 3) setSpeed(e, -2)
    else if (e.speed > 1) setSpeed(e, -1)
    else setSpeed(e, 0)
    pushOut(e, "x", -1, function() { return blockedOn(tiles, jousterBox(e), "right") })
  } else if (e.vx < 0 && blockedOn(tiles, jousterBox(e), "left")) {
    if (Math.abs(e.speed) >= 2 && events) events.wall = true
    if (e.speed < -3) setSpeed(e, 2)
    else if (e.speed < -1) setSpeed(e, 1)
    else setSpeed(e, 0)
    pushOut(e, "x", 1, function() { return blockedOn(tiles, jousterBox(e), "left") })
  }
}

function wrapX(e) {
  if (e.x > WIDTH) e.x = 1
  if (e.x < 0) e.x = WIDTH - 1
}

function clampY(e) {
  var minY = BB_TOP
  if (e.y < minY) {
    e.y = minY
    if (e.vy < 0) e.vy = -0.5 * e.vy
  }
}

function integrateJouster(tiles, e, dt, events) {
  var grounded = onGround(tiles, e)
  applyMoveIntent(e, grounded, dt)

  e.x += e.vx * dt
  wrapX(e)
  collideX(tiles, e, events)

  e.vy += e.weight * dt
  if (e.vy > MAX_Y) e.vy = MAX_Y

  if (e.vy > 0) {
    e.y += e.vy * dt
    if (blockedOn(tiles, jousterBox(e), "down")) {
      e.weight = 0
      e.vy = 0
      e.y = Math.floor(e.y)
      pushOut(e, "y", -1, function() { return blockedOn(tiles, jousterBox(e), "down") })
    }
  } else if (e.vy < 0) {
    e.y += e.vy * dt
    if (blockedOn(tiles, jousterBox(e), "up")) {
      e.vy = -0.5 * e.vy
      e.y = Math.floor(e.y)
      pushOut(e, "y", 1, function() { return blockedOn(tiles, jousterBox(e), "up") })
    }
  }
  clampY(e)

  if (e.weight === 0 && !onGround(tiles, e)) e.weight = WEIGHT

  grounded = onGround(tiles, e)
  if (grounded) e.state = e.speed === 0 ? "stand" : "walk"
  else e.state = e.vy > 0 ? "fall" : "fly"
  if ((e.speed > 0 && e.wannaLeft) || (e.speed < 0 && e.wannaRight)) {
    e.state = grounded ? "brake" : "airbrake"
  }
  if (e.vx > 0.1) e.facing = 1
  if (e.vx < -0.1) e.facing = -1
  e.age += dt
  e.jumpDelay -= dt
}

function flap(e, events) {
  if (e.jumpDelay > 0) return
  e.vy = JUMP
  e.weight = WEIGHT
  e.jumpDelay = JUMP_DELAY
  if (events) events.flap = true
}

function hitJump(e) {
  if (e.vy > HIT_JUMP) e.vy = HIT_JUMP
}

function bumpSpeeds(left, right) {
  if (left.x < right.x) {
    if (left.speed >= 0) setSpeed(left, -1)
    else if (left.speed > -SPEED_MAX) setSpeed(left, left.speed - 1)
    if (right.speed <= 0) setSpeed(right, 1)
    else if (right.speed < SPEED_MAX) setSpeed(right, right.speed + 1)
  }
}

function makeJouster(kind, rank, x, y) {
  return {
    kind: kind,
    rank: rank || 0,
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    speed: 0,
    speedDelay: 0,
    jumpDelay: 0,
    weight: WEIGHT,
    age: 0,
    facing: 1,
    state: "fall",
    wannaLeft: false,
    wannaRight: false,
    alive: true,
    aiPsy: 0,
    aiSpeed: 2,
    aiDelay: 3,
    jumpTimer: 0.8,
    leftDir: false
  }
}

function spawnAtGate(tiles, gates, others, rand) {
  var list = gates && gates.length ? gates : [[2, 4], [29, 10]]
  var best = list[0]
  var bestD = -1
  for (var i = 0; i < list.length; i++) {
    var gx = list[i][0] * TILE + TILE / 2
    var gy = list[i][1] * TILE
    var nearest = 1e12
    for (var j = 0; j < others.length; j++) {
      var o = others[j]
      if (!o || !o.alive) continue
      var dx = gx - o.x
      var dy = gy - o.y
      var d2 = dx * dx + dy * dy
      if (d2 < nearest) nearest = d2
    }
    if (nearest > bestD) {
      bestD = nearest
      best = list[i]
    }
  }
  var x = best[0] * TILE + TILE / 2
  var y = best[1] * TILE - 16
  if (rand01(rand) > 0.5) x += 1
  return { x: x, y: y }
}

function mapForWave(wave) {
  var maps = getLevels()
  if (!maps.length) return { bots: [3, 0, 0, 0], gates: [[7, 3]], tiles: [] }
  return maps[(wave - 1) % maps.length]
}

function startWave(state, wave, rand) {
  var level = mapForWave(wave)
  state.wave = wave
  state.tiles = clone(level.tiles)
  state.gates = clone(level.gates)
  state.botsToCome = level.bots.slice()
  state.targets = state.botsToCome[0] + state.botsToCome[1] + state.botsToCome[2] + state.botsToCome[3]
  state.bots = []
  state.eggs = []
  state.nextBot = BOT_DELAY
  state.levelTime = 0
  state.waveBanner = 2.2
  state.playerRespawn = 0.4
  if (state.targets === 0) seedEggWave(state, rand)
  var spawn = spawnAtGate(state.tiles, state.gates, [], rand)
  state.player = makeJouster("player", 0, spawn.x, spawn.y)
  state.playerAlive = true
  return state
}

function seedEggWave(state, rand) {
  var tiles = state.tiles
  for (var y = 1; y < MAP_H - 1; y++) {
    for (var x = 0; x < MAP_W; x++) {
      if (tiles[y][x] === EMPTY && isBlocking(tiles[y + 1][x]) && tiles[y + 1][x] !== LAVA) {
        state.eggs.push({
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
          vx: 0,
          vy: 0,
          weight: WEIGHT,
          rank: rand01(rand) < 0.5 ? 0 : 1,
          age: 0,
          incubate: EGG_INCUBATE_MIN + rand01(rand) * (EGG_INCUBATE_MAX - EGG_INCUBATE_MIN)
        })
        state.targets++
        x++
      }
    }
  }
}

function initialState() {
  return {
    phase: "ready",
    wave: 1,
    score: 0,
    lives: INITIAL_LIVES,
    nextLife: LIFE_UP,
    tiles: [],
    gates: [],
    player: makeJouster("player", 0, WIDTH / 2, 80),
    playerAlive: false,
    playerRespawn: 0,
    bots: [],
    eggs: [],
    botsToCome: [0, 0, 0, 0],
    targets: 0,
    nextBot: 0,
    combo: 0,
    comboDelay: 0,
    levelTime: 0,
    waveBanner: 0,
    input: { left: false, right: false, flap: false }
  }
}

function start(state, rand) {
  var next = clone(state || initialState())
  next.phase = "playing"
  next.score = 0
  next.lives = INITIAL_LIVES
  next.nextLife = LIFE_UP
  next.combo = 0
  return startWave(next, 1, rand)
}

function pause(state) {
  var next = clone(state)
  if (next.phase === "playing") next.phase = "paused"
  else if (next.phase === "paused") next.phase = "playing"
  return next
}

function setInput(state, input) {
  var next = clone(state)
  next.input = {
    left: !!input.left,
    right: !!input.right,
    flap: !!input.flap
  }
  return next
}

function addScore(state, events, amount) {
  state.score += amount
  if (state.score >= state.nextLife) {
    state.lives++
    state.nextLife += LIFE_UP
    events.lifeUp = true
  }
}

function livingOthers(state) {
  var list = []
  if (state.playerAlive && state.player) list.push(state.player)
  for (var i = 0; i < state.bots.length; i++) {
    if (state.bots[i].alive) list.push(state.bots[i])
  }
  return list
}

function maybeSpawnBot(state, rand, events) {
  var rank = -1
  for (var i = 0; i < 4; i++) {
    if (state.botsToCome[i] > 0) {
      rank = i
      break
    }
  }
  if (rank < 0) return
  if (state.nextBot > 0) return
  var spawn = spawnAtGate(state.tiles, state.gates, livingOthers(state), rand)
  var bot = makeJouster("bot", rank, spawn.x, spawn.y)
  bot.aiPsy = Math.floor(rand01(rand) * 3)
  bot.aiSpeed = 1 + Math.floor(rand01(rand) * 4)
  bot.aiDelay = 3 + rand01(rand) * 5
  bot.jumpTimer = 0.8 + rand01(rand) * 0.5
  bot.leftDir = rand01(rand) < 0.5
  state.bots.push(bot)
  state.botsToCome[rank]--
  state.nextBot = BOT_DELAY
  events.gate = true
}

function thinkBot(bot, player, dt, rand) {
  if (bot.vx > 0.1) bot.leftDir = false
  else if (bot.vx < -0.1) bot.leftDir = true

  bot.jumpTimer -= dt
  bot.aiDelay -= dt
  var wannaJump = false
  if (bot.jumpTimer <= 0) {
    wannaJump = true
    if (bot.aiPsy === 0) bot.jumpTimer = 0.3 + rand01(rand) * 0.5
    else if (bot.aiPsy === 1) bot.jumpTimer = 0.6 + rand01(rand) * 0.8
    else bot.jumpTimer = 30
  }
  if (bot.aiDelay <= 0) {
    bot.aiPsy = Math.floor(rand01(rand) * 3)
    bot.aiSpeed = 3 + Math.floor(rand01(rand) * 3)
    bot.aiDelay = 2 + rand01(rand) * 4
    if (rand01(rand) < 0.5 && bot.speed !== 0) bot.leftDir = !bot.leftDir
  }
  if (bot.y > HEIGHT - TILE * 3) wannaJump = true
  if (player && player.alive && bot.rank >= 1) {
    if (player.y + 12 < bot.y) wannaJump = true
  }
  var target = bot.leftDir ? -bot.aiSpeed : bot.aiSpeed
  bot.wannaLeft = bot.speed > target
  bot.wannaRight = bot.speed < target
  if (wannaJump) flap(bot, null)
}

function resolveJoust(state, a, b, events) {
  if (!a.alive || !b.alive) return
  if (a.age < LATENCY || b.age < LATENCY) return
  if (!boxesOverlap(jousterBox(a), jousterBox(b))) return
  events.hit = true
  if (a.y >= b.y + KILL_DIST) {
    a.alive = false
    hitJump(b)
    return { winner: b, loser: a }
  }
  if (b.y >= a.y + KILL_DIST) {
    b.alive = false
    hitJump(a)
    return { winner: a, loser: b }
  }
  bumpSpeeds(a.x <= b.x ? a : b, a.x <= b.x ? b : a)
  return null
}

function dropEgg(state, bot, rand) {
  var rank = bot.rank >= 3 ? 3 : bot.rank + 1
  state.eggs.push({
    x: bot.x,
    y: bot.y,
    vx: bot.vx,
    vy: bot.vy,
    weight: WEIGHT,
    rank: rank,
    age: 0,
    incubate: EGG_INCUBATE_MIN + rand01(rand) * (EGG_INCUBATE_MAX - EGG_INCUBATE_MIN)
  })
}

function integrateEgg(tiles, egg, dt) {
  egg.vx *= EGG_VISCOSITY
  egg.vy *= EGG_VISCOSITY
  egg.vy += egg.weight * dt
  if (egg.vy > MAX_Y) egg.vy = MAX_Y
  egg.x += egg.vx * dt
  wrapX(egg)
  egg.y += egg.vy * dt
  if (egg.vy < 0 && blockedOn(tiles, eggBox(egg), "up")) {
    egg.vy = 0
    egg.y = Math.max(8, Math.floor(egg.y))
    pushOut(egg, "y", 1, function() { return blockedOn(tiles, eggBox(egg), "up") })
  } else if (blockedOn(tiles, eggBox(egg), "down")) {
    egg.vy = 0
    egg.weight = 0
    egg.y = Math.floor(egg.y)
    pushOut(egg, "y", -1, function() { return blockedOn(tiles, eggBox(egg), "down") })
  }
  if (egg.weight === 0) {
    var box = eggBox(egg)
    var ty = Math.floor((box.bottom + 1) / TILE)
    var grounded = false
    var x0 = Math.floor(box.left / TILE)
    var x1 = Math.floor((box.right - 0.001) / TILE)
    for (var tx = x0; tx <= x1; tx++) {
      if (isBlocking(tileAt(tiles, tx, ty))) grounded = true
    }
    if (!grounded) egg.weight = WEIGHT
  }
  egg.age += dt
}

function remainingTargets(state) {
  var n = 0
  for (var i = 0; i < 4; i++) n += state.botsToCome[i]
  for (var b = 0; b < state.bots.length; b++) if (state.bots[b].alive) n++
  n += state.eggs.length
  return n
}

function step(state, seconds, rand) {
  var next = clone(state)
  var events = emptyEvents()
  if (next.phase !== "playing") return { state: next, events: events }

  var dt = Math.max(0, Math.min(0.034, seconds))
  next.levelTime += dt
  if (next.waveBanner > 0) next.waveBanner -= dt
  if (next.comboDelay > 0) {
    next.comboDelay -= dt
    if (next.comboDelay <= 0) next.combo = 0
  }

  next.nextBot -= dt
  maybeSpawnBot(next, rand, events)

  if (!next.playerAlive) {
    next.playerRespawn -= dt
    if (next.lives >= 0 && next.playerRespawn <= 0) {
      var spawn = spawnAtGate(next.tiles, next.gates, livingOthers(next), rand)
      next.player = makeJouster("player", 0, spawn.x, spawn.y)
      next.playerAlive = true
      events.gate = true
    }
  } else {
    var p = next.player
    if (p.age >= LATENCY) {
      p.wannaLeft = !!next.input.left
      p.wannaRight = !!next.input.right && !p.wannaLeft
      if (next.input.flap) flap(p, events)
    }
    integrateJouster(next.tiles, p, dt, events)
    if (inLava(next.tiles, p, false)) {
      p.alive = false
      next.playerAlive = false
      next.lives--
      events.die = true
      events.burn = true
      if (next.lives < 0) next.phase = "gameover"
      else next.playerRespawn = REBORN_DELAY
    }
  }

  for (var i = 0; i < next.bots.length; i++) {
    var bot = next.bots[i]
    if (!bot.alive) continue
    if (bot.age >= LATENCY) thinkBot(bot, next.playerAlive ? next.player : null, dt, rand)
    integrateJouster(next.tiles, bot, dt, events)
    if (inLava(next.tiles, bot, false)) {
      bot.alive = false
      events.burn = true
    }
  }

  if (next.playerAlive) {
    for (var j = 0; j < next.bots.length; j++) {
      var enemy = next.bots[j]
      if (!enemy.alive) continue
      var result = resolveJoust(next, next.player, enemy, events)
      if (!result) continue
      if (result.loser.kind === "bot") {
        events.kill = true
        next.combo++
        var combo = Math.min(COMBO_MAX, next.combo)
        addScore(next, events, BOT_SCORE[result.loser.rank] * combo)
        next.comboDelay = MULTIKILL_DELAY
        dropEgg(next, result.loser, rand)
      } else {
        events.die = true
        next.playerAlive = false
        next.lives--
        if (next.lives < 0) next.phase = "gameover"
        else next.playerRespawn = REBORN_DELAY
      }
    }
  }

  var keptEggs = []
  for (var e = 0; e < next.eggs.length; e++) {
    var egg = next.eggs[e]
    integrateEgg(next.tiles, egg, dt)
    if (inLava(next.tiles, egg, true)) {
      events.burn = true
      continue
    }
    var collected = false
    if (next.playerAlive && next.player.age >= LATENCY && boxesOverlap(jousterBox(next.player), eggBox(egg))) {
      addScore(next, events, EGG_SCORE[egg.rank])
      events.egg = true
      collected = true
    }
    if (collected) continue
    if (egg.age >= egg.incubate) {
      var hatched = makeJouster("bot", egg.rank, egg.x, egg.y - 30)
      hatched.aiSpeed = 3
      next.bots.push(hatched)
      events.hatch = true
      continue
    }
    keptEggs.push(egg)
  }
  next.eggs = keptEggs

  var liveBots = []
  for (var k = 0; k < next.bots.length; k++) {
    if (next.bots[k].alive) liveBots.push(next.bots[k])
  }
  next.bots = liveBots

  if (next.phase === "playing" && remainingTargets(next) <= 0 && next.waveBanner <= 0) {
    var bonus = Math.max(0, LEVEL_TIME_BONUS - Math.floor(LEVEL_TIME_BONUS * (next.levelTime / LEVEL_TIME)))
    bonus -= bonus % 5
    if (next.playerAlive) addScore(next, events, bonus)
    events.wave = true
    startWave(next, next.wave + 1, rand)
  }

  return { state: next, events: events }
}

function mountFrame(entity) {
  if (!entity) return 0
  if (entity.state === "stand") return 0
  if (entity.state === "walk" || entity.state === "brake") {
    var mag = Math.abs(entity.speed) || 1
    return Math.floor(entity.age * mag * 4) % 6
  }
  var air = 6 + Math.floor(entity.age * 8) % 4
  if (entity.vy > MAX_Y * 0.6) return entity.kind === "player" ? 10 : 8
  return air
}

function parsePreferences(raw) {
  var defaults = { version: 1, bestScore: 0, muted: false, transparent: false }
  if (!raw) return defaults
  try {
    var value = JSON.parse(raw)
    return {
      version: 1,
      bestScore: Math.max(0, Math.floor(Number(value.bestScore) || 0)),
      muted: value.muted === true,
      transparent: value.transparent === true
    }
  } catch (error) {
    return defaults
  }
}

function serializePreferences(bestScore, muted, transparent) {
  return JSON.stringify({
    version: 1,
    bestScore: Math.max(0, Math.floor(Number(bestScore) || 0)),
    muted: muted === true,
    transparent: transparent === true
  }, null, 2) + "\n"
}

if (typeof module !== "undefined") {
  module.exports = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    TILE: TILE,
    MAP_W: MAP_W,
    MAP_H: MAP_H,
    EMPTY: EMPTY,
    LAVA: LAVA,
    SOLID: SOLID,
    GATE: GATE,
    JUMP: JUMP,
    WEIGHT: WEIGHT,
    LATENCY: LATENCY,
    setLevels: setLevels,
    getLevels: getLevels,
    initialState: initialState,
    start: start,
    pause: pause,
    setInput: setInput,
    step: step,
    mountFrame: mountFrame,
    parsePreferences: parsePreferences,
    serializePreferences: serializePreferences,
    jousterBox: jousterBox,
    onGround: onGround
  }
}
