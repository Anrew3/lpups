import QtQuick
import QtQuick.Layouts
import "../components"

/**
 * SystemControl — shutdown / restart buttons with confirmation.
 */
GlassCard {
    RowLayout {
        anchors.fill: parent
        spacing: 10

        ConfirmButton {
            Layout.fillWidth: true
            Layout.fillHeight: true
            label: "\u23FB  Shutdown"
            confirmLabel: "Shutdown?"
            accentColor: "#f85149"
            onConfirmed: systemCtl.shutdown()
        }

        // Divider
        Rectangle {
            Layout.preferredWidth: 1
            Layout.fillHeight: true
            Layout.topMargin: 6
            Layout.bottomMargin: 6
            color: "#30363d"
        }

        ConfirmButton {
            Layout.fillWidth: true
            Layout.fillHeight: true
            label: "\u21BA  Restart"
            confirmLabel: "Restart?"
            accentColor: "#f0883e"
            onConfirmed: systemCtl.restart()
        }
    }
}
