import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui

Item {
  id: root

  property var record: null
  readonly property string stateDirectory: Quickshell.env("HOME") + "/.local/state/hearthstone-matchup"
  readonly property string statePath: stateDirectory + "/state.json"
  readonly property var activeToplevel: ToplevelManager.activeToplevel
  readonly property string activeWindow: activeToplevel
    ? String((activeToplevel.title || "") + " " + (activeToplevel.appId || "")).toLowerCase()
    : ""
  readonly property bool hearthstoneFocused: activeWindow.indexOf("hearthstone") !== -1
  readonly property bool hasCombatState: record && (
    record.status === "simulating" || record.status === "ready" || record.status === "error"
  )
  readonly property bool opened: hearthstoneFocused && hasCombatState
  readonly property var focusedScreen: {
    var focusedMonitor = Hyprland.focusedMonitor
    var focusedName = focusedMonitor ? String(focusedMonitor.name || "") : ""
    var screens = Quickshell.screens || []
    for (var index = 0; index < screens.length; index++) {
      if (String(screens[index].name || "") === focusedName) return screens[index]
    }
    return screens.length > 0 ? screens[0] : null
  }

  function parseState(content) {
    try {
      var parsed = JSON.parse(String(content || ""))
      root.record = parsed && parsed.version === 1 ? parsed : null
    } catch (error) {
      root.record = null
    }
  }

  function formatPercent(value) {
    var number = Number(value)
    if (!isFinite(number)) return "—"
    return (Math.round(number * 10) / 10).toFixed(number % 1 === 0 ? 0 : 1) + "%"
  }

  function formatRuns(value) {
    var number = Number(value)
    if (!isFinite(number) || number <= 0) return ""
    if (number >= 1000) {
      var thousands = number / 1000
      return thousands.toFixed(number % 1000 === 0 ? 0 : 1) + "K"
    }
    return String(Math.round(number))
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.parseState(text())
    onLoadFailed: root.record = null
  }

  // FileView cannot subscribe to a path that did not exist when it loaded.
  // Watching the systemd-created parent directory makes first creation and
  // atomic rename writes reliably trigger a reload of the actual state file.
  FileView {
    path: root.stateDirectory
    watchChanges: true
    printErrors: false
    onFileChanged: stateFile.reload()
    onLoaded: stateFile.reload()
  }

  PanelWindow {
    id: panel
    screen: root.focusedScreen
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "hearthstone-matchup"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    exclusionMode: ExclusionMode.Ignore

    // The entire surface is visual-only. An empty input region keeps every
    // mouse click and scroll event going to Hearthstone underneath it.
    mask: Region {}

    BorderSurface {
      id: card
      width: Style.space(280)
      height: Style.space(64)
      anchors.top: parent.top
      anchors.right: parent.right
      anchors.topMargin: Style.space(14)
      anchors.rightMargin: Style.space(14)
      color: Util.alpha(Color.background, 0.94)
      borderSpec: Border.surfaceSpec("popups", "border", Color.accent, Math.max(1, Style.space(2)))
      radius: Style.cornerRadius

      Column {
        anchors.fill: parent
        anchors.margins: Style.space(8)
        spacing: Style.space(4)

        Row {
          width: parent.width
          height: Style.font.body

          Text {
            id: headingText
            text: "BG ODDS"
            color: Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
            opacity: 0.75
          }

          Item { width: Math.max(0, parent.width - headingText.implicitWidth - statusText.implicitWidth) }

          Text {
            id: statusText
            text: root.record && root.record.status === "ready"
              ? (root.record.partial ? "PARTIAL • " : "ESTIMATE • ")
                  + root.formatRuns(root.record.simulations)
              : "LIVE"
            color: root.record && root.record.partial ? "#f1c75b" : Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
          }
        }

        Item {
          width: parent.width
          height: Style.space(28)

          Text {
            visible: !root.record || root.record.status !== "ready"
            anchors.centerIn: parent
            text: root.record && root.record.status === "error"
              ? String(root.record.message || "This combat could not be simulated")
              : "CALCULATING…"
            color: root.record && root.record.status === "error" ? "#ef6f6c" : Color.popups.text
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
            elide: Text.ElideRight
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
          }

          Row {
            visible: root.record && root.record.status === "ready"
            anchors.fill: parent
            spacing: Style.space(4)

            Text {
              width: (parent.width - parent.spacing * 2) / 3
              anchors.verticalCenter: parent.verticalCenter
              text: "W  " + root.formatPercent(root.record ? root.record.win : 0)
              color: "#82d173"
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              font.bold: true
              horizontalAlignment: Text.AlignHCenter
            }

            Text {
              width: (parent.width - parent.spacing * 2) / 3
              anchors.verticalCenter: parent.verticalCenter
              text: "T  " + root.formatPercent(root.record ? root.record.tie : 0)
              color: "#f1c75b"
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              font.bold: true
              horizontalAlignment: Text.AlignHCenter
            }

            Text {
              width: (parent.width - parent.spacing * 2) / 3
              anchors.verticalCenter: parent.verticalCenter
              text: "L  " + root.formatPercent(root.record ? root.record.loss : 0)
              color: "#ef6f6c"
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              font.bold: true
              horizontalAlignment: Text.AlignHCenter
            }
          }
        }
      }
    }
  }
}
