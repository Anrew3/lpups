import QtQuick
import QtQuick.Layouts
import "../components"

/**
 * NetworkCard — WiFi / Cellular priority toggle.
 * iOS-style segmented control look.
 */
GlassCard {
    id: netCard
    title: "NETWORK"

    property string mode: "UNKNOWN"
    property bool switching: false

    Connections {
        target: systemCtl
        function onNetworkModeChanged(m) { netCard.mode = m }
        function onNetworkSwitching(s) { netCard.switching = s }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 10

        Item { Layout.fillHeight: true }

        // Current mode display
        Text {
            Layout.alignment: Qt.AlignHCenter
            text: switching ? "Switching..." : (mode === "WIFI" ? "Wi-Fi" : mode === "CELLULAR" ? "Cellular" : "Unknown")
            color: "#e6edf3"
            font.pixelSize: 18
            font.weight: Font.Bold

            SequentialAnimation on opacity {
                running: switching
                loops: Animation.Infinite
                NumberAnimation { to: 0.3; duration: 500 }
                NumberAnimation { to: 1.0; duration: 500 }
            }
        }

        // Mode icon
        Text {
            Layout.alignment: Qt.AlignHCenter
            text: mode === "WIFI" ? "\uD83D\uDCF6" : mode === "CELLULAR" ? "\uD83D\uDCF1" : "\u2753"
            font.pixelSize: 24
            opacity: switching ? 0.3 : 1
        }

        Item { Layout.fillHeight: true }

        // Toggle button
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
            radius: 10
            color: "#21262d"
            border.color: "#30363d"
            border.width: 1
            opacity: switching ? 0.5 : 1

            RowLayout {
                anchors.fill: parent
                anchors.margins: 3
                spacing: 3

                // WiFi option
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 8
                    color: mode === "WIFI" ? "#1f6feb" : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "Wi-Fi"
                        color: mode === "WIFI" ? "#ffffff" : "#8b949e"
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }

                    MouseArea {
                        anchors.fill: parent
                        enabled: !switching
                        cursorShape: Qt.PointingHandCursor
                        onClicked: systemCtl.setNetwork("wifi")
                    }
                }

                // Cellular option
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 8
                    color: mode === "CELLULAR" ? "#8957e5" : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "Cellular"
                        color: mode === "CELLULAR" ? "#ffffff" : "#8b949e"
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }

                    MouseArea {
                        anchors.fill: parent
                        enabled: !switching
                        cursorShape: Qt.PointingHandCursor
                        onClicked: systemCtl.setNetwork("cellular")
                    }
                }
            }
        }
    }
}
