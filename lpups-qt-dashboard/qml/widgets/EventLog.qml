import QtQuick
import QtQuick.Controls
import "../components"

/**
 * EventLog — scrolling list of Arduino events.
 * Newest event highlighted in amber.
 */
GlassCard {
    title: "EVENTS"

    ListView {
        id: listView
        anchors.fill: parent
        model: eventLog
        clip: true
        spacing: 2

        // Auto-scroll to top on new event
        Connections {
            target: eventLog
            function onNewEventAdded() { listView.positionViewAtBeginning() }
        }

        delegate: Rectangle {
            width: listView.width
            height: eventText ? Math.max(24, eventLabel.implicitHeight + 8) : 24
            radius: 6
            color: isLatest ? Qt.rgba(0.824, 0.6, 0.133, 0.1) : "transparent"

            Row {
                anchors.fill: parent
                anchors.leftMargin: 6
                anchors.rightMargin: 6
                spacing: 6

                // Chevron
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: isLatest ? "\u25B6" : "\u25B8"
                    color: isLatest ? "#d29922" : "#484f58"
                    font.pixelSize: 8
                }

                Text {
                    id: eventLabel
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - 20
                    text: eventText || ""
                    color: isLatest ? "#d29922" : "#8b949e"
                    font.pixelSize: 10
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                }
            }

            // Fade-in animation
            opacity: 0
            Component.onCompleted: opacity = 1
            Behavior on opacity {
                NumberAnimation { duration: 250; easing.type: Easing.OutQuad }
            }
        }

        // Empty state
        Text {
            visible: listView.count === 0
            anchors.centerIn: parent
            text: "No events yet"
            color: "#484f58"
            font.pixelSize: 11
            font.italic: true
        }

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
            contentItem: Rectangle {
                implicitWidth: 3
                radius: 1.5
                color: "#484f58"
                opacity: 0.5
            }
        }
    }
}
