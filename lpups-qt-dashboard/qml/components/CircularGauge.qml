import QtQuick
import QtQuick.Shapes

/**
 * CircularGauge — 270-degree arc gauge with percentage and sublabel.
 * iOS-style with smooth animation and color transitions.
 */
Item {
    id: gauge
    property real value: 0          // 0-100
    property string sublabel: ""
    property string unit: "%"
    property bool charging: false

    implicitWidth: 160
    implicitHeight: 160

    // Color based on percentage
    function pctColor(pct) {
        if (pct >= 60) return "#3fb950"
        if (pct >= 30) return "#d29922"
        if (pct >= 15) return "#f0883e"
        return "#f85149"
    }

    // Track arc (background)
    Shape {
        anchors.centerIn: parent
        width: gauge.width - 16
        height: gauge.height - 16

        ShapePath {
            strokeColor: "#21262d"
            strokeWidth: 8
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap

            PathAngleArc {
                centerX: (gauge.width - 16) / 2
                centerY: (gauge.height - 16) / 2
                radiusX: (gauge.width - 32) / 2
                radiusY: (gauge.height - 32) / 2
                startAngle: 135
                sweepAngle: 270
            }
        }
    }

    // Value arc (foreground)
    Shape {
        anchors.centerIn: parent
        width: gauge.width - 16
        height: gauge.height - 16

        ShapePath {
            strokeColor: pctColor(gauge.value)
            strokeWidth: 8
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap

            PathAngleArc {
                centerX: (gauge.width - 16) / 2
                centerY: (gauge.height - 16) / 2
                radiusX: (gauge.width - 32) / 2
                radiusY: (gauge.height - 32) / 2
                startAngle: 135
                sweepAngle: 270 * Math.min(gauge.value / 100, 1)

                Behavior on sweepAngle {
                    NumberAnimation { duration: 700; easing.type: Easing.InOutQuad }
                }
            }
        }
    }

    // Center text
    Column {
        anchors.centerIn: parent
        spacing: 2

        // Percentage value
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Math.round(gauge.value) + gauge.unit
            color: "#e6edf3"
            font.pixelSize: 32
            font.weight: Font.Bold

            Behavior on text {
                enabled: false
            }
        }

        // Sublabel
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            visible: sublabel !== ""
            text: sublabel
            color: "#8b949e"
            font.pixelSize: 11
        }

        // Charging indicator
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            visible: charging
            text: "\u26A1 Charging"
            color: "#3fb950"
            font.pixelSize: 10

            SequentialAnimation on opacity {
                running: charging
                loops: Animation.Infinite
                NumberAnimation { to: 0.4; duration: 700 }
                NumberAnimation { to: 1.0; duration: 700 }
            }
        }
    }
}
