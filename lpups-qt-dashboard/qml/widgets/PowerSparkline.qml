import QtQuick
import QtQuick.Layouts
import "../components"

/**
 * PowerSparkline — real-time power draw chart.
 * Canvas-based line chart with gradient fill.
 */
GlassCard {
    id: sparkCard
    title: "POWER DRAW"

    ColumnLayout {
        anchors.fill: parent
        spacing: 6

        // Stats row
        RowLayout {
            Layout.fillWidth: true
            spacing: 16

            Column {
                Text { text: "NOW"; color: "#6e7681"; font.pixelSize: 9 }
                Text {
                    text: powerHistory.current.toFixed(0) + "W"
                    color: "#58a6ff"
                    font.pixelSize: 16
                    font.weight: Font.Bold
                }
            }
            Column {
                Text { text: "AVG"; color: "#6e7681"; font.pixelSize: 9 }
                Text {
                    text: powerHistory.avg.toFixed(1) + "W"
                    color: "#8b949e"
                    font.pixelSize: 14
                }
            }
            Column {
                Text { text: "PEAK"; color: "#6e7681"; font.pixelSize: 9 }
                Text {
                    text: powerHistory.peak.toFixed(0) + "W"
                    color: "#f0883e"
                    font.pixelSize: 14
                }
            }
        }

        // Canvas chart
        Canvas {
            id: chart
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Repaint when stats change
            Connections {
                target: powerHistory
                function onStatsChanged() { chart.requestPaint() }
            }

            onPaint: {
                var ctx = getContext("2d")
                var w = width
                var h = height
                ctx.clearRect(0, 0, w, h)

                var points = powerHistory.getPoints()
                if (points.length < 2) return

                var maxVal = Math.max(powerHistory.peak, 10)
                var step = w / (60 - 1)

                // Draw grid lines
                ctx.strokeStyle = "#21262d"
                ctx.lineWidth = 0.5
                for (var g = 0; g < 4; g++) {
                    var gy = h * (g + 1) / 5
                    ctx.beginPath()
                    ctx.moveTo(0, gy)
                    ctx.lineTo(w, gy)
                    ctx.stroke()
                }

                // Gradient fill
                var gradient = ctx.createLinearGradient(0, 0, 0, h)
                gradient.addColorStop(0, "rgba(88, 166, 255, 0.25)")
                gradient.addColorStop(1, "rgba(88, 166, 255, 0.02)")

                ctx.beginPath()
                ctx.moveTo(0, h)
                for (var i = 0; i < points.length; i++) {
                    var x = i * step + (60 - points.length) * step
                    var y = h - (points[i] / maxVal) * (h - 4)
                    if (i === 0) ctx.lineTo(x, y)
                    else ctx.lineTo(x, y)
                }
                ctx.lineTo((points.length - 1) * step + (60 - points.length) * step, h)
                ctx.closePath()
                ctx.fillStyle = gradient
                ctx.fill()

                // Line
                ctx.beginPath()
                ctx.strokeStyle = "#58a6ff"
                ctx.lineWidth = 2
                ctx.lineJoin = "round"
                for (var j = 0; j < points.length; j++) {
                    var lx = j * step + (60 - points.length) * step
                    var ly = h - (points[j] / maxVal) * (h - 4)
                    if (j === 0) ctx.moveTo(lx, ly)
                    else ctx.lineTo(lx, ly)
                }
                ctx.stroke()

                // Current value dot
                if (points.length > 0) {
                    var lastX = (points.length - 1) * step + (60 - points.length) * step
                    var lastY = h - (points[points.length - 1] / maxVal) * (h - 4)

                    // Glow
                    ctx.beginPath()
                    ctx.arc(lastX, lastY, 6, 0, 2 * Math.PI)
                    ctx.fillStyle = "rgba(88, 166, 255, 0.3)"
                    ctx.fill()

                    // Dot
                    ctx.beginPath()
                    ctx.arc(lastX, lastY, 3, 0, 2 * Math.PI)
                    ctx.fillStyle = "#58a6ff"
                    ctx.fill()
                }
            }
        }
    }
}
