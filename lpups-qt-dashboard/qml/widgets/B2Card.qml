import QtQuick
import QtQuick.Layouts
import "../components"

/**
 * B2Card — 12V LiON pack display.
 * Shows remaining capacity, power draw, estimated runtime.
 */
GlassCard {
    title: "B2 \u2022 12V LiON"
    accentColor: upsData.b2Charging ? "#3fb950" : "#d29922"
    highlighted: upsData.b2Present

    ColumnLayout {
        anchors.fill: parent
        spacing: 6

        // Not present state
        Item {
            visible: !upsData.b2Present
            Layout.fillWidth: true
            Layout.fillHeight: true

            Column {
                anchors.centerIn: parent
                spacing: 8

                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: "\u2014"
                    color: "#484f58"
                    font.pixelSize: 40
                }
                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: "Not Detected"
                    color: "#6e7681"
                    font.pixelSize: 12
                }
            }
        }

        // Present state
        Item {
            visible: upsData.b2Present
            Layout.fillWidth: true
            Layout.fillHeight: true

            ColumnLayout {
                anchors.fill: parent
                spacing: 6

                // Charging badge
                Row {
                    Layout.alignment: Qt.AlignHCenter
                    spacing: 8

                    Rectangle {
                        visible: upsData.b2Charging
                        width: b2ChgLabel.width + 14
                        height: 20
                        radius: 10
                        color: Qt.rgba(0.247, 0.725, 0.314, 0.15)
                        border.color: Qt.rgba(0.247, 0.725, 0.314, 0.3)
                        border.width: 1

                        Text {
                            id: b2ChgLabel
                            anchors.centerIn: parent
                            text: "\u26A1 CHG"
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
                    value: upsData.b2Remaining
                    sublabel: upsData.b2VoltageStr
                    charging: upsData.b2Charging
                }

                Item { Layout.fillHeight: true }

                // Stats
                StatRow {
                    Layout.fillWidth: true
                    label: "Power Draw"
                    value: upsData.b2PowerDrawW + "W"
                    valueColor: upsData.b2PowerDrawW > 30 ? "#f0883e" : "#c9d1d9"
                }
                StatRow {
                    Layout.fillWidth: true
                    label: "Avg Current"
                    value: upsData.b2AvgCurrentStr
                    valueColor: "#c9d1d9"
                }
                StatRow {
                    Layout.fillWidth: true
                    label: "Runtime"
                    value: upsData.b2RuntimeStr
                    valueColor: upsData.b2RuntimeMins > 0 && upsData.b2RuntimeMins < 30 ? "#f0883e" : "#c9d1d9"
                }
            }
        }
    }
}
