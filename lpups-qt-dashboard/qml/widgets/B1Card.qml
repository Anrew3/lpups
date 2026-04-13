import QtQuick
import QtQuick.Layouts
import "../components"

/**
 * B1Card — 18650 UPS battery pack display.
 * Circular gauge with voltage, current direction, temperature.
 */
GlassCard {
    title: "18650 UPS"
    accentColor: upsData.b1Charging ? "#3fb950" : "#58a6ff"
    highlighted: upsData.b1AcPresent

    ColumnLayout {
        anchors.fill: parent
        spacing: 6

        // Status badges row
        Row {
            Layout.alignment: Qt.AlignHCenter
            spacing: 8

            // AC badge
            Rectangle {
                visible: upsData.b1AcPresent
                width: acLabel.width + 14
                height: 20
                radius: 10
                color: Qt.rgba(0.247, 0.725, 0.314, 0.15)
                border.color: Qt.rgba(0.247, 0.725, 0.314, 0.3)
                border.width: 1

                Text {
                    id: acLabel
                    anchors.centerIn: parent
                    text: "\u26A1 AC"
                    color: "#3fb950"
                    font.pixelSize: 10
                    font.weight: Font.Medium
                }
            }

            // Charging badge
            Rectangle {
                visible: upsData.b1Charging
                width: chgLabel.width + 14
                height: 20
                radius: 10
                color: Qt.rgba(0.247, 0.725, 0.314, 0.15)
                border.color: Qt.rgba(0.247, 0.725, 0.314, 0.3)
                border.width: 1

                Text {
                    id: chgLabel
                    anchors.centerIn: parent
                    text: "CHG"
                    color: "#3fb950"
                    font.pixelSize: 10
                    font.weight: Font.Medium
                }
            }
        }

        // Circular gauge
        CircularGauge {
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: Math.min(parent.width - 20, 180)
            Layout.preferredHeight: Layout.preferredWidth
            value: upsData.b1Capacity
            sublabel: upsData.b1VoltageStr
            charging: upsData.b1Charging
        }

        // Stats
        Item { Layout.fillHeight: true }

        StatRow {
            Layout.fillWidth: true
            label: "Current"
            value: upsData.b1CurrentStr
            valueColor: upsData.b1Current > 0 ? "#3fb950" : upsData.b1Current < 0 ? "#f0883e" : "#8b949e"
        }
        StatRow {
            Layout.fillWidth: true
            label: "Direction"
            value: upsData.b1CurrentDirection
            valueColor: "#8b949e"
        }
        StatRow {
            Layout.fillWidth: true
            label: "Runtime"
            value: upsData.b1RuntimeStr
            valueColor: "#88ccff"
        }
        StatRow {
            Layout.fillWidth: true
            label: "Temperature"
            value: upsData.b1Temperature > 0 ? upsData.b1Temperature + "\u00B0C" : "--"
            valueColor: upsData.b1Temperature > 45 ? "#f85149" : "#c9d1d9"
        }
    }
}
