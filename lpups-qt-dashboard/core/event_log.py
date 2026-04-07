"""
event_log.py
QAbstractListModel for the scrolling event log in QML.
"""

from PySide6.QtCore import (
    QAbstractListModel, QModelIndex, Qt, Slot, Signal, Property,
)

MAX_EVENTS = 60


class EventLogModel(QAbstractListModel):
    """Stores the last 60 Arduino events for display in QML ListView."""

    EventTextRole = Qt.UserRole + 1
    IsLatestRole = Qt.UserRole + 2

    countChanged = Signal()
    newEventAdded = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._events: list[str] = []

    def roleNames(self):
        return {
            self.EventTextRole: b"eventText",
            self.IsLatestRole: b"isLatest",
        }

    def rowCount(self, parent=QModelIndex()):
        return len(self._events)

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid() or index.row() >= len(self._events):
            return None
        row = index.row()
        if role == self.EventTextRole or role == Qt.DisplayRole:
            return self._events[row]
        if role == self.IsLatestRole:
            return row == 0
        return None

    @Property(int, notify=countChanged)
    def count(self):
        return len(self._events)

    @Slot(str)
    def addEvent(self, msg: str):
        """Prepend a new event (newest first)."""
        self.beginInsertRows(QModelIndex(), 0, 0)
        self._events.insert(0, msg)
        self.endInsertRows()

        # Trim old events
        if len(self._events) > MAX_EVENTS:
            excess = len(self._events) - MAX_EVENTS
            self.beginRemoveRows(QModelIndex(), MAX_EVENTS, len(self._events) - 1)
            self._events = self._events[:MAX_EVENTS]
            self.endRemoveRows()

        self.countChanged.emit()
        self.newEventAdded.emit()

        # Mark previous "latest" as no longer latest
        if len(self._events) > 1:
            idx = self.index(1)
            self.dataChanged.emit(idx, idx, [self.IsLatestRole])
