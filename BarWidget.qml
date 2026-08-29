import QtQuick
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "io.github.tomfaulkner.ostrich-riders"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰑮"
    tooltipText: "Play Ostrich Riders"

    onPressed: function(mouseButton) {
      if (!root.bar || mouseButton !== Qt.LeftButton) return
      root.bar.run("omarchy-shell shell toggle io.github.tomfaulkner.ostrich-riders '{}'")
    }
  }
}
