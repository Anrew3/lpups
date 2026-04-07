"""
power_history.py
Stores rolling power draw history for the sparkline chart.
"""

from PySide6.QtCore import (
    QAbstractListModel, QModelIndex, Qt, Slot, Signal, Property,
)

MAX_POINTS = 60


class PowerHistoryModel(QAbstractListModel):
    """Rolling 60-point power draw history."""

    PowerRole = Qt.UserRole + 1
    statsChanged = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._points: list[float] = []
        self._peak = 0.0
        self._avg = 0.0
        self._current = 0.0

    def roleNames(self):
        return {self.PowerRole: b"power"}

    def rowCount(self, parent=QModelIndex()):
        return len(self._points)

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid() or index.row() >= len(self._points):
            return None
        if role == self.PowerRole or role == Qt.DisplayRole:
            return self._points[index.row()]
        return None

    @Property(float, notify=statsChanged)
    def peak(self):
        return self._peak

    @Property(float, notify=statsChanged)
    def avg(self):
        return self._avg

    @Property(float, notify=statsChanged)
    def current(self):
        return self._current

    @Property(int, notify=statsChanged)
    def pointCount(self):
        return len(self._points)

    @Slot(float)
    def addPoint(self, watts: float):
        """Append a power reading. Trims to 60 points."""
        self._current = watts

        # Append
        self.beginInsertRows(QModelIndex(), len(self._points), len(self._points))
        self._points.append(watts)
        self.endInsertRows()

        # Trim
        if len(self._points) > MAX_POINTS:
            self.beginRemoveRows(QModelIndex(), 0, 0)
            self._points.pop(0)
            self.endRemoveRows()

        # Update stats
        self._peak = max(self._points) if self._points else 0
        self._avg = sum(self._points) / len(self._points) if self._points else 0
        self.statsChanged.emit()

    @Slot(result=list)
    def getPoints(self):
        """Return all points as a JS array for Canvas drawing."""
        return list(self._points)
