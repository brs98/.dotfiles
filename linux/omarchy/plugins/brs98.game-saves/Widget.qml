import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "brs98.game-saves"

  readonly property string scriptPath: Quickshell.env("HOME") + "/.dotfiles/linux/scripts/game-saves-sync"
  property string resultState: "idle"
  property string resultMessage: "Close your emulator, then click to sync game saves."
  property string lastSuccess: ""
  property bool syncPending: false
  property bool syncStarted: false
  property bool statusStarted: false
  property int syncGeneration: 0
  property int statusGeneration: 0
  readonly property bool busy: syncPending || resultState === "busy"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function fail(message) {
    resultState = "error"
    resultMessage = message
  }

  function applyResult(output, fallback) {
    try {
      const result = JSON.parse(output)
      if (!result || ["idle", "success", "error", "busy"].indexOf(result.state) < 0 || typeof result.message !== "string") {
        fail(fallback)
        return
      }
      resultState = result.state
      resultMessage = result.message
      if (typeof result.lastSuccess === "string") lastSuccess = result.lastSuccess
    } catch (error) {
      fail(fallback)
    }
  }

  function refresh() {
    if (!syncPending && !statusProcess.running) {
      statusGeneration = syncGeneration
      statusStarted = false
      statusStartTimer.restart()
      statusProcess.running = true
    }
  }

  function sync() {
    if (busy) return
    syncPending = true
    syncStarted = false
    syncGeneration += 1
    startTimer.restart()
    syncProcess.running = true
  }

  function tooltip() {
    let value = "Game Saves\n" + (syncPending ? "Syncing game saves…" : resultMessage)
    if (lastSuccess) {
      const date = new Date(lastSuccess)
      value += "\nLast successful sync: " + (isNaN(date.getTime()) ? lastSuccess : date.toLocaleString())
    }
    if (!busy) value += "\nClick to sync · Close your emulator first"
    return value
  }

  IpcHandler {
    target: "brs98.game-saves"

    function sync(): void { root.sync() }

    function status(): string {
      return JSON.stringify({
        state: root.syncPending ? "busy" : root.resultState,
        message: root.syncPending ? "Syncing game saves…" : root.resultMessage,
        busy: root.busy
      })
    }
  }

  Process {
    id: syncProcess
    command: [root.scriptPath, "sync"]
    stdout: StdioCollector { id: syncOutput; waitForEnd: true }
    onStarted: {
      root.syncStarted = true
      startTimer.stop()
    }
    onExited: function(exitCode) {
      startTimer.stop()
      root.syncPending = false
      root.applyResult(syncOutput.text, "Sync did not return a result (exit " + exitCode + "). Check the game-saves-sync script.")
    }
  }

  // Failed process launches do not emit exited on all Quickshell versions.
  Timer {
    id: startTimer
    interval: 2000
    onTriggered: {
      if (!root.syncStarted) {
        root.syncPending = false
        root.fail("Could not start game-saves-sync. Check that the script is installed and executable.")
      }
    }
  }

  Process {
    id: statusProcess
    command: [root.scriptPath, "status"]
    stdout: StdioCollector { id: statusOutput; waitForEnd: true }
    onStarted: {
      root.statusStarted = true
      statusStartTimer.stop()
    }
    onExited: function(exitCode) {
      statusStartTimer.stop()
      // A read started before a click must not replace that sync's result.
      if (!root.syncPending && root.statusGeneration === root.syncGeneration)
        root.applyResult(statusOutput.text, "Could not read game save status (exit " + exitCode + ").")
    }
  }

  Timer {
    id: statusStartTimer
    interval: 2000
    onTriggered: {
      if (!root.statusStarted && !root.syncPending && root.statusGeneration === root.syncGeneration)
        root.fail("Could not read game save status. Check that game-saves-sync is installed and executable.")
    }
  }

  // Includes results from the automatic watcher and clicks on other monitors.
  Timer {
    interval: 15000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.busy ? "\uf021" : "\uf11b"
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    pressable: !root.busy
    foreground: root.resultState === "error" ? Color.urgent
      : root.resultState === "success" || root.busy ? Color.accent
      : (root.bar ? root.bar.barForeground : Color.foreground)
    tooltipText: root.tooltip()
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.sync()
    }
  }
}
