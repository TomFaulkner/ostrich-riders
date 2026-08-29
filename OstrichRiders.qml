import QtQuick
import QtQuick.Effects
import QtMultimedia
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import "Game.js" as Game
import "Levels.js" as Levels

Item {
  id: root

  property var shell: null
  property var manifest: null
  property bool opened: false
  property var game: Game.initialState()
  property int bestScore: 0
  property bool muted: false
  property bool preferencesLoaded: false
  property double lastTick: 0
  property bool flapHeld: false
  property bool leftHeld: false
  property bool rightHeld: false

  readonly property string pluginId: "TomFaulkner.ostrich-riders"
  readonly property string homeDir: Quickshell.env("HOME")
  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") || (homeDir + "/.local/state")
  readonly property string stateDir: stateHome + "/ostrich-riders"
  readonly property string statePath: stateDir + "/state.json"
  readonly property string stateReader: decodeURIComponent(Qt.resolvedUrl("tools/read-state.py").toString().replace(/^file:\/\//, ""))

  readonly property color ink: Color.foreground
  readonly property color night: Color.background
  readonly property color accent: Color.accent
  readonly property color danger: Color.urgent
  readonly property color hush: Color.muted
  readonly property color sky: Qt.tint(Color.background, Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.16))
  readonly property color ground: Qt.tint(Color.background, Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.28))
  readonly property color lava: Qt.tint(Color.urgent, Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.25))

  function enemyTint(rank) {
    if (rank <= 0) return Qt.lighter(root.hush, 1.35)
    if (rank === 1) return root.ink
    if (rank === 2) return Qt.tint(root.danger, Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.35))
    return root.danger
  }

  function open(payloadJson) {
    Game.setLevels(Levels.MAPS)
    opened = true
    game = Game.initialState()
    lastTick = Date.now()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    playfield.requestPaint()
  }

  function close() {
    opened = false
    clearHeld()
    if (game.phase === "playing") game = Game.pause(game)
  }

  function dismiss() {
    close()
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
  }

  function toggle() {
    if (opened) dismiss()
    else open("{}")
  }

  function clearHeld() {
    flapHeld = false
    leftHeld = false
    rightHeld = false
    if (game && game.input)
      game = Game.setInput(game, { left: false, right: false, flap: false })
  }

  function applyInput() {
    game = Game.setInput(game, { left: leftHeld, right: rightHeld, flap: flapHeld })
  }

  function actStart() {
    if (game.phase === "ready" || game.phase === "gameover") {
      clearHeld()
      game = Game.start(Game.initialState(), Math.random)
      lastTick = Date.now()
      gateSound.play()
    }
    playfield.requestPaint()
  }

  function togglePause() {
    if (game.phase !== "playing" && game.phase !== "paused") return
    clearHeld()
    game = Game.pause(game)
    lastTick = Date.now()
    playfield.requestPaint()
  }

  function toggleMute() {
    muted = !muted
    scheduleSave()
    playfield.requestPaint()
  }

  function tick() {
    if (!opened || game.phase !== "playing") return
    var now = Date.now()
    applyInput()
    var result
    try {
      result = Game.step(game, (now - lastTick) / 1000, Math.random)
    } catch (error) {
      console.warn("ostrich-riders step failed", error)
      lastTick = now
      return
    }
    lastTick = now
    game = result.state
    var ev = result.events
    if (ev.flap) flapSound.play()
    if (ev.wall) wallSound.play()
    if (ev.hit) hitSound.play()
    if (ev.kill) fallSound.play()
    if (ev.egg) eggSound.play()
    if (ev.burn) burnSound.play()
    if (ev.gate) gateSound.play()
    if (ev.lifeUp) lifeSound.play()
    if (ev.wave) menuSound.play()
    if (ev.die && game.score > bestScore) {
      bestScore = game.score
      scheduleSave()
    }
    if (game.phase === "gameover" && game.score > bestScore) {
      bestScore = game.score
      scheduleSave()
    }
    playfield.requestPaint()
  }

  function scheduleSave() {
    if (preferencesLoaded) saveTimer.restart()
  }

  function loadPreferences(raw) {
    if (preferencesLoaded) return
    var parsed = Game.parsePreferences(raw)
    bestScore = parsed.bestScore
    muted = parsed.muted
    preferencesLoaded = true
  }

  function savePreferences() {
    preferencesFile.setText(Game.serializePreferences(bestScore, muted))
  }

  Process {
    id: ensureStateDir
    command: ["mkdir", "-p", root.stateDir]
    onExited: safeStateReader.running = true
  }

  Process {
    id: safeStateReader
    command: ["python3", root.stateReader, root.statePath]
    stdout: StdioCollector {
      onStreamFinished: root.loadPreferences(text)
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) root.loadPreferences("")
    }
  }

  FileView {
    id: preferencesFile
    path: root.statePath
    preload: false
    watchChanges: false
    atomicWrites: true
    printErrors: false
  }

  Timer {
    id: saveTimer
    interval: 150
    repeat: false
    onTriggered: root.savePreferences()
  }

  Timer {
    interval: 16
    repeat: true
    running: root.opened
    onTriggered: root.tick()
  }

  SoundEffect { id: flapSound; source: Qt.resolvedUrl("assets/sounds/wingsFlap.wav"); volume: root.muted ? 0 : 0.42 }
  SoundEffect { id: wallSound; source: Qt.resolvedUrl("assets/sounds/collisionWall.wav"); volume: root.muted ? 0 : 0.28 }
  SoundEffect { id: hitSound; source: Qt.resolvedUrl("assets/sounds/collisionJouster.wav"); volume: root.muted ? 0 : 0.34 }
  SoundEffect { id: fallSound; source: Qt.resolvedUrl("assets/sounds/jousterFall.wav"); volume: root.muted ? 0 : 0.38 }
  SoundEffect { id: eggSound; source: Qt.resolvedUrl("assets/sounds/eggCrash.wav"); volume: root.muted ? 0 : 0.36 }
  SoundEffect { id: burnSound; source: Qt.resolvedUrl("assets/sounds/burn.wav"); volume: root.muted ? 0 : 0.32 }
  SoundEffect { id: gateSound; source: Qt.resolvedUrl("assets/sounds/gate.wav"); volume: root.muted ? 0 : 0.30 }
  SoundEffect { id: lifeSound; source: Qt.resolvedUrl("assets/sounds/lifeUp.wav"); volume: root.muted ? 0 : 0.36 }
  SoundEffect { id: menuSound; source: Qt.resolvedUrl("assets/sounds/menuMove.wav"); volume: root.muted ? 0 : 0.28 }

  Component.onCompleted: {
    Game.setLevels(Levels.MAPS)
    ensureStateDir.running = true
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; right: true; bottom: true; left: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "ostrich-riders"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    Rectangle {
      anchors.fill: parent
      color: Qt.rgba(0, 0, 0, 0.72)
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    Item {
      id: gameFrame
      width: Game.WIDTH
      height: Game.HEIGHT
      anchors.centerIn: parent
      scale: Math.min((panel.width - 32) / width, (panel.height - 32) / height)

      Rectangle {
        anchors.fill: parent
        color: root.sky
        border.color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.55)
        border.width: 2
        radius: 4
      }

      Canvas {
        id: playfield
        anchors.fill: parent
        z: 0

        function pixelText(ctx, value, x, y, size, align) {
          ctx.save()
          ctx.font = "bold " + size + "px monospace"
          ctx.textAlign = align || "center"
          ctx.textBaseline = "middle"
          ctx.lineWidth = Math.max(2, Math.floor(size / 10))
          ctx.strokeStyle = root.night
          ctx.strokeText(value, x, y)
          ctx.fillStyle = root.ink
          ctx.fillText(value, x, y)
          ctx.restore()
        }

        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          ctx.imageSmoothingEnabled = false
          ctx.fillStyle = root.sky
          ctx.fillRect(0, 0, width, height)

          var tiles = root.game.tiles || []
          for (var y = 0; y < tiles.length; y++) {
            var row = tiles[y]
            for (var x = 0; x < row.length; x++) {
              var kind = row[x]
              if (kind === Game.EMPTY) continue
              var px = x * Game.TILE
              var py = y * Game.TILE
              if (kind === Game.LAVA) {
                ctx.fillStyle = root.lava
                ctx.fillRect(px, py + 6, Game.TILE, Game.TILE - 6)
                ctx.fillStyle = Qt.lighter(root.lava, 1.35)
                ctx.fillRect(px, py + 6, Game.TILE, 4)
              } else if (kind === Game.GATE) {
                ctx.fillStyle = root.ground
                ctx.fillRect(px, py, Game.TILE, Game.TILE)
                ctx.fillStyle = Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.55)
                ctx.beginPath()
                ctx.arc(px + Game.TILE / 2, py + Game.TILE / 2, 9, 0, Math.PI * 2)
                ctx.fill()
              } else {
                ctx.fillStyle = root.ground
                ctx.fillRect(px, py, Game.TILE, Game.TILE)
                ctx.fillStyle = Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.18)
                ctx.fillRect(px, py, Game.TILE, 3)
              }
            }
          }

          if (root.game.phase === "playing" || root.game.phase === "paused") {
            pixelText(ctx, String(root.game.score), width / 2, 28, 28)
            pixelText(ctx, "WAVE " + root.game.wave, 18, 28, 16, "left")
            pixelText(ctx, "LIVES " + Math.max(0, root.game.lives + 1), width - 18, 28, 16, "right")
          }

          if (root.game.phase === "ready") {
            pixelText(ctx, "OSTRICH RIDERS", width / 2, 220, 42)
            pixelText(ctx, "STAY ABOVE YOUR OPPONENT", width / 2, 280, 16)
            pixelText(ctx, "ARROWS / AD  MOVE    SPACE / W  FLAP", width / 2, 430, 14)
            pixelText(ctx, "SPACE TO RIDE     M MUTE     ESC CLOSE", width / 2, 470, 14)
            pixelText(ctx, "BEST  " + root.bestScore, width / 2, 520, 16)
          } else if (root.game.phase === "paused") {
            ctx.fillStyle = Qt.rgba(root.night.r, root.night.g, root.night.b, 0.78)
            ctx.fillRect(width / 2 - 180, 250, 360, 140)
            pixelText(ctx, "PAUSED", width / 2, 300, 32)
            pixelText(ctx, "P TO RESUME", width / 2, 348, 14)
          } else if (root.game.phase === "gameover") {
            ctx.fillStyle = Qt.rgba(root.night.r, root.night.g, root.night.b, 0.84)
            ctx.fillRect(width / 2 - 220, 220, 440, 210)
            pixelText(ctx, "GAME OVER", width / 2, 270, 32)
            pixelText(ctx, "SCORE  " + root.game.score, width / 2, 320, 18)
            pixelText(ctx, "BEST   " + root.bestScore, width / 2, 354, 18)
            pixelText(ctx, "ENTER / SPACE TO RIDE AGAIN", width / 2, 400, 14)
          } else if (root.game.waveBanner > 0) {
            pixelText(ctx, "WAVE " + root.game.wave, width / 2, height / 2, 48)
          }

          pixelText(ctx, root.muted ? "MUTED" : "SOUND ON", 14, height - 16, 11, "left")
        }
      }

      JousterSprite {
        visible: root.game.playerAlive && root.game.player && root.game.player.age >= Game.LATENCY / 2
        x: root.game.player ? root.game.player.x - 32 : 0
        y: (root.game.player ? root.game.player.y - 32 : 0) + (Game.mountFrame(root.game.player) === 5 ? 4 : 0)
        z: 2
        sheet: Qt.resolvedUrl("assets/sprites/hero0.png")
        frame: Game.mountFrame(root.game.player)
        facing: root.game.player ? root.game.player.facing : 1
        tint: root.accent
        hero: true
        invuln: root.game.player && root.game.player.age < Game.LATENCY ? Math.max(0.2, root.game.player.age) : 1
      }

      Repeater {
        model: root.game.bots ? root.game.bots.length : 0
        JousterSprite {
          required property int index
          property var bot: root.game.bots[index]
          visible: bot && bot.alive && bot.age >= Game.LATENCY / 2
          x: bot ? bot.x - 32 : 0
          y: (bot ? bot.y - 32 : 0) + (Game.mountFrame(bot) === 5 ? 4 : 0)
          z: 2
          sheet: Qt.resolvedUrl("assets/sprites/ennemy" + Math.min(3, bot ? bot.rank : 0) + ".png")
          frame: Game.mountFrame(bot)
          facing: bot ? bot.facing : 1
          tint: root.enemyTint(bot ? bot.rank : 0)
          invuln: bot && bot.age < Game.LATENCY ? Math.max(0.2, bot.age) : 1
        }
      }

      Repeater {
        model: root.game.eggs ? root.game.eggs.length : 0
        Item {
          required property int index
          property var egg: root.game.eggs[index]
          visible: !!egg
          x: egg ? egg.x - 8 : 0
          y: egg ? egg.y - 8 : 0
          width: 16
          height: 16
          z: 2
          scale: egg && egg.age > egg.incubate - 6 ? 1.15 + 0.12 * Math.sin(egg.age * 5) : 1

          Image {
            id: eggSrc
            visible: false
            source: Qt.resolvedUrl("assets/sprites/egg16.png")
            smooth: false
          }

          MultiEffect {
            anchors.fill: parent
            source: eggSrc
            colorization: 0.75
            colorizationColor: root.ink
          }
        }
      }

      MouseArea {
        anchors.fill: parent
        onPressed: {
          if (root.game.phase === "ready" || root.game.phase === "gameover") root.actStart()
          else if (root.game.phase === "playing") root.flapHeld = true
        }
        onReleased: root.flapHeld = false
        onCanceled: root.flapHeld = false
        onExited: if (pressed) root.flapHeld = false
      }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (event.isAutoRepeat && event.key !== Qt.Key_Left && event.key !== Qt.Key_Right
              && event.key !== Qt.Key_A && event.key !== Qt.Key_D
              && event.key !== Qt.Key_H && event.key !== Qt.Key_L) {
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Escape) root.dismiss()
          else if (event.key === Qt.Key_P) root.togglePause()
          else if (event.key === Qt.Key_M) root.toggleMute()
          else if (event.key === Qt.Key_Left || event.key === Qt.Key_A || event.key === Qt.Key_H) root.leftHeld = true
          else if (event.key === Qt.Key_Right || event.key === Qt.Key_D || event.key === Qt.Key_L) root.rightHeld = true
          else if (event.key === Qt.Key_Space || event.key === Qt.Key_Up || event.key === Qt.Key_W) {
            if (root.game.phase === "ready" || root.game.phase === "gameover") root.actStart()
            else root.flapHeld = true
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) root.actStart()
          else return
          event.accepted = true
        }
        Keys.onReleased: function(event) {
          if (event.key === Qt.Key_Left || event.key === Qt.Key_A || event.key === Qt.Key_H) root.leftHeld = false
          else if (event.key === Qt.Key_Right || event.key === Qt.Key_D || event.key === Qt.Key_L) root.rightHeld = false
          else if (event.key === Qt.Key_Space || event.key === Qt.Key_Up || event.key === Qt.Key_W) root.flapHeld = false
        }

        onActiveFocusChanged: {
          if (!activeFocus) {
            root.clearHeld()
            if (root.opened && root.game.phase === "playing") root.togglePause()
          }
        }
      }
    }
  }
}
