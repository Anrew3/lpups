import QtQuick

/**
 * ClockWidget — simple digital clock with pulsing colon.
 */
Item {
    id: clock
    implicitWidth: timeText.width + 8
    implicitHeight: 28

    property string timeStr: ""
    property string dateStr: ""

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            var now = new Date()
            var h = now.getHours()
            var m = now.getMinutes()
            var ampm = h >= 12 ? "PM" : "AM"
            h = h % 12 || 12
            clock.timeStr = h + ":" + (m < 10 ? "0" : "") + m + " " + ampm
            clock.dateStr = (now.getMonth() + 1) + "/" + now.getDate()
        }
    }

    Row {
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8

        Text {
            id: dateLabel
            text: dateStr
            color: "#484f58"
            font.pixelSize: 11
            anchors.verticalCenter: parent.verticalCenter
        }

        Text {
            id: timeText
            text: timeStr
            color: "#8b949e"
            font.pixelSize: 13
            font.weight: Font.Medium
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
