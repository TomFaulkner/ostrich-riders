import QtQuick
import QtQuick.Effects

Item {
  id: root
  width: 64
  height: 64

  property url sheet
  property int frame: 0
  property int facing: 1
  property color tint: "#cccccc"
  property bool hero: false
  property real invuln: 1

  opacity: invuln

  Item {
    anchors.fill: parent
    transform: Scale {
      origin.x: 32
      origin.y: 32
      xScale: root.facing < 0 ? -1 : 1
    }

    Image {
      id: mountSrc
      visible: false
      width: 64
      height: 64
      source: root.sheet
      sourceClipRect: Qt.rect(root.frame * 64, 0, 64, 64)
      smooth: false
      antialiasing: false
      cache: true
    }

    MultiEffect {
      anchors.fill: parent
      source: mountSrc
      colorization: 0.82
      colorizationColor: root.tint
      brightness: 0.08
    }
  }

  Image {
    id: riderSrc
    visible: false
    width: 64
    height: 64
    source: root.sheet
    sourceClipRect: Qt.rect(root.facing < 0 ? 64 : 0, 64, 64, 64)
    smooth: false
    antialiasing: false
    cache: true
  }

  MultiEffect {
    anchors.fill: parent
    source: riderSrc
    colorization: 0.55
    colorizationColor: root.hero ? root.tint : Qt.lighter(root.tint, 1.25)
    brightness: 0.12
  }
}
