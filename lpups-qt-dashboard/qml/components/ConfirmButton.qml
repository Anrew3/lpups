import QtQuick

/**
 * ConfirmButton — two-step confirmation button (iOS-style destructive action).
 * Tap once to arm, tap again to confirm. Auto-cancels after 4 seconds.
 */
Item {
    id: btn
    property string label: "Action"
    property string confirmLabel: "Confirm?"
    property color accentColor: "#f85149"
    property color normalColor: "#21262d"
    property bool armed: false

    signal confirmed()

    implicitHeight: 38
    implicitWidth: 120

    Timer {
        id: cancelTimer
        interval: 4000
        onTriggered: btn.armed = false
    }

    Rectangle {
        id: bg
        anchors.fill: parent
        radius: 10
        color: armed ? accentColor : normalColor
        border.color: armed ? accentColor : "#30363d"
        border.width: 1

        Behavior on color {
            ColorAnimation { duration: 200 }
        }

        Text {
            anchors.centerIn: parent
            text: armed ? btn.confirmLabel : btn.label
            color: armed ? "#ffffff" : "#c9d1d9"
            font.pixelSize: 12
            font.weight: Font.Medium
        }

        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                if (armed) {
                    armed = false
                    cancelTimer.stop()
                    confirmed()
                } else {
                    armed = true
                    cancelTimer.restart()
                }
            }
        }
    }

    // Countdown bar
    Rectangle {
        visible: armed
        anchors.bottom: bg.bottom
        anchors.left: bg.left
        anchors.margins: 1
        height: 3
        radius: 1.5
        color: Qt.rgba(1, 1, 1, 0.4)
        width: bg.width - 2

        Rectangle {
            anchors.left: parent.left
            height: parent.height
            radius: parent.radius
            color: "#ffffff"
            width: parent.width

            NumberAnimation on width {
                running: btn.armed
                from: bg.width - 2
                to: 0
                duration: 4000
            }
        }
    }
}
