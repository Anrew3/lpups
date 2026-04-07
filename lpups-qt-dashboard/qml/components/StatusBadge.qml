import QtQuick

/**
 * StatusBadge — connection indicator with ping animation.
 */
Item {
    id: badge
    property bool connected: false
    property string portName: ""

    implicitWidth: row.width
    implicitHeight: 28

    Row {
        id: row
        spacing: 8
        anchors.verticalCenter: parent.verticalCenter

        // Dot with ping animation
        Item {
            width: 12
            height: 12
            anchors.verticalCenter: parent.verticalCenter

            // Ping ring
            Rectangle {
                id: ping
                anchors.centerIn: parent
                width: 12
                height: 12
                radius: 6
                color: "transparent"
                border.color: connected ? "#3fb950" : "#f85149"
                border.width: 1.5
                opacity: 0

                SequentialAnimation on opacity {
                    running: connected
                    loops: Animation.Infinite
                    NumberAnimation { to: 0.8; duration: 0 }
                    NumberAnimation { to: 0; duration: 1800 }
                    PauseAnimation { duration: 1000 }
                }
                SequentialAnimation on scale {
                    running: connected
                    loops: Animation.Infinite
                    NumberAnimation { to: 1.0; duration: 0 }
                    NumberAnimation { to: 2.4; duration: 1800; easing.type: Easing.OutQuad }
                    PauseAnimation { duration: 1000 }
                }
            }

            // Solid dot
            Rectangle {
                anchors.centerIn: parent
                width: 8
                height: 8
                radius: 4
                color: connected ? "#3fb950" : "#f85149"
            }
        }

        // Label
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: connected ? portName : "Disconnected"
            color: connected ? "#8b949e" : "#f85149"
            font.pixelSize: 11
        }
    }
}
