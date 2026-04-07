import QtQuick
import QtQuick.Effects

/**
 * GlassCard — frosted glass container.
 * Semi-transparent dark background with subtle border and inner glow.
 */
Item {
    id: card
    default property alias content: innerContent.data
    property string title: ""
    property color accentColor: "#58a6ff"
    property bool highlighted: false

    Rectangle {
        id: bg
        anchors.fill: parent
        radius: 16
        color: highlighted ? Qt.rgba(accentColor.r, accentColor.g, accentColor.b, 0.08) : "#161b22"
        border.color: highlighted ? Qt.rgba(accentColor.r, accentColor.g, accentColor.b, 0.3) : "#30363d"
        border.width: 1

        // Top inner highlight (glass shimmer)
        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: 1
            height: parent.radius
            radius: parent.radius
            gradient: Gradient {
                GradientStop { position: 0.0; color: Qt.rgba(1, 1, 1, 0.04) }
                GradientStop { position: 1.0; color: "transparent" }
            }
        }
    }

    // Title
    Text {
        id: titleText
        visible: title !== ""
        text: title
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.topMargin: 14
        anchors.leftMargin: 16
        color: "#8b949e"
        font.pixelSize: 11
        font.weight: Font.Medium
        font.letterSpacing: 1.5
    }

    // Content area
    Item {
        id: innerContent
        anchors.fill: parent
        anchors.topMargin: title !== "" ? 36 : 12
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        anchors.bottomMargin: 12
    }
}
