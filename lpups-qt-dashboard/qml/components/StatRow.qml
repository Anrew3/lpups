import QtQuick

/**
 * StatRow — a label/value pair for battery stats.
 */
Item {
    id: statRow
    property string label: ""
    property string value: ""
    property color valueColor: "#c9d1d9"

    implicitHeight: 20
    implicitWidth: parent ? parent.width : 200

    Text {
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: statRow.label
        color: "#6e7681"
        font.pixelSize: 11
    }

    Text {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: statRow.value
        color: statRow.valueColor
        font.pixelSize: 12
        font.weight: Font.Medium
    }
}
