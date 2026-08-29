const test = require("node:test")
const assert = require("node:assert/strict")
const Game = require("../Game.js")
const Levels = require("../Levels.js")

Game.setLevels(Levels.MAPS)

function play(state, frames, input, rand) {
  let current = Game.setInput(state, input || {})
  const rng = rand || (() => 0.4)
  for (let i = 0; i < frames; i++) {
    current = Game.step(current, 0.016, rng).state
    current = Game.setInput(current, input || {})
  }
  return current
}

test("standard pack has twelve waves", () => {
  assert.equal(Levels.MAPS.length, 12)
  assert.equal(Levels.MAPS[0].bots[0], 4)
  assert.ok(Levels.MAPS[0].gates.length >= 2)
})

test("starts ready and begins on wave one", () => {
  const ready = Game.initialState()
  assert.equal(ready.phase, "ready")
  const playing = Game.start(ready, () => 0.3)
  assert.equal(playing.phase, "playing")
  assert.equal(playing.wave, 1)
  assert.equal(playing.playerAlive, true)
  assert.ok(playing.tiles.length === Game.MAP_H)
})

test("gravity pulls a floating jouster down", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.player.x = 400
  playing.player.y = 200
  playing.player.vy = 0
  playing.player.weight = Game.WEIGHT
  playing.player.age = 1
  const later = Game.step(playing, 0.05, () => 0.3).state
  assert.ok(later.player.y > playing.player.y)
  assert.ok(later.player.vy > 0)
})

test("flap applies an upward impulse", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.player.x = 400
  playing.player.y = 200
  playing.player.age = 1
  playing.player.jumpDelay = 0
  playing.player.vy = 0
  const flapped = Game.step(Game.setInput(playing, { flap: true }), 0.016, () => 0.3)
  assert.ok(flapped.state.player.vy < 0)
  assert.equal(flapped.events.flap, true)
})

test("the higher jouster wins a clash", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.player.age = 1
  playing.player.x = 400
  playing.player.y = 180
  playing.bots = [{
    kind: "bot",
    rank: 0,
    x: 400,
    y: 200,
    vx: 0,
    vy: 0,
    speed: 0,
    speedDelay: 0,
    jumpDelay: 0,
    weight: Game.WEIGHT,
    age: 1,
    facing: 1,
    state: "fall",
    wannaLeft: false,
    wannaRight: false,
    alive: true,
    aiPsy: 0,
    aiSpeed: 1,
    aiDelay: 10,
    jumpTimer: 10,
    leftDir: false
  }]
  const result = Game.step(playing, 0.016, () => 0.3)
  assert.equal(result.state.bots.length, 0)
  assert.equal(result.state.playerAlive, true)
  assert.equal(result.events.kill, true)
  assert.ok(result.state.score >= 500)
  assert.ok(result.state.eggs.length === 1 || result.events.egg)
})

test("lava kills the player and spends a life", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.player.age = 1
  playing.player.x = 16
  playing.player.y = Game.HEIGHT - 8
  playing.player.vy = 50
  const result = Game.step(playing, 0.016, () => 0.3)
  assert.equal(result.state.playerAlive, false)
  assert.equal(result.state.lives, Game.initialState().lives - 1)
  assert.equal(result.events.die, true)
})

test("pause freezes the sim", () => {
  const paused = Game.pause(Game.start(Game.initialState(), () => 0.3))
  assert.equal(paused.phase, "paused")
  assert.deepEqual(Game.step(paused, 0.016, () => 0.3).state, paused)
  assert.equal(Game.pause(paused).phase, "playing")
})

test("egg hatches into a higher-rank bot", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.bots = []
  playing.botsToCome = [0, 0, 0, 0]
  playing.eggs = [{
    x: 200,
    y: 40,
    vx: 0,
    vy: 0,
    weight: 0,
    rank: 1,
    age: 20,
    incubate: 8
  }]
  const result = Game.step(playing, 0.016, () => 0.3)
  assert.equal(result.state.eggs.length, 0)
  assert.equal(result.state.bots.length, 1)
  assert.equal(result.state.bots[0].rank, 1)
  assert.equal(result.events.hatch, true)
})

test("flying along the ceiling does not hang the sim", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.player.x = 400
  playing.player.y = 6
  playing.player.vy = Game.JUMP
  playing.player.vx = 220
  playing.player.speed = 4
  playing.player.age = 1
  playing.player.weight = Game.WEIGHT
  const started = Date.now()
  let current = playing
  for (let i = 0; i < 90; i++) {
    current = Game.step(Game.setInput(current, { flap: true, right: true }), 0.016, () => 0.3).state
  }
  assert.ok(Date.now() - started < 1000)
  assert.equal(current.phase, "playing")
  assert.ok(current.player.y >= 4)
})

test("a clash against the ceiling still resolves", () => {
  const playing = Game.start(Game.initialState(), () => 0.3)
  playing.player.age = 1
  playing.player.x = 400
  playing.player.y = 8
  playing.player.vy = -50
  playing.bots = [{
    kind: "bot",
    rank: 0,
    x: 400,
    y: 28,
    vx: 0,
    vy: -40,
    speed: 0,
    speedDelay: 0,
    jumpDelay: 0,
    weight: Game.WEIGHT,
    age: 1,
    facing: 1,
    state: "fly",
    wannaLeft: false,
    wannaRight: false,
    alive: true,
    aiPsy: 0,
    aiSpeed: 1,
    aiDelay: 10,
    jumpTimer: 10,
    leftDir: false
  }]
  const started = Date.now()
  const result = Game.step(playing, 0.016, () => 0.3)
  assert.ok(Date.now() - started < 200)
  assert.equal(result.events.kill, true)
  assert.equal(result.state.playerAlive, true)
})

test("preferences parse safely", () => {
  assert.deepEqual(Game.parsePreferences("not json"), { version: 1, bestScore: 0, muted: false })
  assert.deepEqual(Game.parsePreferences('{"bestScore":12.8,"muted":true}'), {
    version: 1,
    bestScore: 12,
    muted: true
  })
})
