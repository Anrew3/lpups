import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import "components"
import "views"
import "widgets"

ApplicationWindow {
    id: root
    width: 1024
    height: 600
    visible: true
    title: "LPUPS Dashboard"
    color: "#0d1117"
    visibility: isDev ? Window.Windowed : Window.FullScreen
    flags: isDev ? Qt.Window : (Qt.Window | Qt.FramelessWindowHint)

    // ── Fonts ──────────────────────────────────────────────────────────
    FontLoader {
        id: mainFont
        source: ""  // uses system default
    }

    // ── Background gradient ────────────────────────────────────────────
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0d1117" }
            GradientStop { position: 0.5; color: "#111820" }
            GradientStop { position: 1.0; color: "#0a0e14" }
        }
    }

    // ── Main layout ────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        // ── Status bar ─────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 28
            spacing: 12

            // Connection indicator
            StatusBadge {
                connected: upsData.connected
                portName: upsData.serialPort
            }

            Item { Layout.fillWidth: true }

            // Title
            Text {
                text: "LPUPS"
                color: "#8b949e"
                font.pixelSize: 13
                font.weight: Font.Medium
                font.letterSpacing: 3
            }

            Item { Layout.fillWidth: true }

            // Clock
            ClockWidget {}
        }

        // ── Content area ───────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 10

            // Left: B1 Battery Card
            B1Card {
                Layout.fillHeight: true
                Layout.preferredWidth: 280
            }

            // Center: B2 Battery Card
            B2Card {
                Layout.fillHeight: true
                Layout.preferredWidth: 280
            }

            // Right column
            ColumnLayout {
                Layout.fillHeight: true
                Layout.fillWidth: true
                spacing: 10

                // Power sparkline
                PowerSparkline {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 140
                }

                // Network + Events row
                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 10

                    NetworkCard {
                        Layout.fillHeight: true
                        Layout.preferredWidth: parent.width * 0.45
                    }

                    EventLog {
                        Layout.fillHeight: true
                        Layout.fillWidth: true
                    }
                }

                // System controls
                SystemControl {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 50
                }
            }
        }
    }

    // ── Dev mode close shortcut ────────────────────────────────────────
    Shortcut {
        sequence: "Ctrl+Q"
        onActivated: Qt.quit()
    }
    Shortcut {
        sequence: "Escape"
        onActivated: if (isDev) Qt.quit()
    }
}
