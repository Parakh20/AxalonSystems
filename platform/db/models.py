"""SQLAlchemy ORM models for the Axalon solar inspection platform."""
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

# Status values for PanelFault.status
FAULT_OPEN = "open"          # seen in the most recent inspection
FAULT_STALE = "stale"        # was open, not seen in the most recent inspection (awaiting confirmation)
FAULT_RESOLVED = "resolved"  # user-confirmed fix or auto-resolved after N missed inspections


class Park(Base):
    __tablename__ = "parks"
    id = Column(String, primary_key=True)          # e.g. "PARK_01"
    name = Column(String, nullable=False)
    mode = Column(String, default="auto")           # "auto" | "numbered"
    total_panels = Column(Integer, default=0)
    rows = Column(Integer, default=0)
    cols = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(String, primary_key=True)           # "BATCH-PARK_01-20260411-143022"
    park_id = Column(String, ForeignKey("parks.id"), nullable=False)
    flight_date = Column(String, nullable=True)     # store as ISO date string
    total_images = Column(Integer, default=0)
    total_detections = Column(Integer, default=0)
    summary = Column(Text, nullable=True)           # JSON string: {"CRITICAL":3,...}
    created_at = Column(DateTime, default=datetime.utcnow)


class Detection(Base):
    __tablename__ = "detections"
    id = Column(Integer, primary_key=True, autoincrement=True)
    inspection_id = Column(String, ForeignKey("inspections.id"), nullable=False)
    fault_id = Column(Integer, ForeignKey("panel_faults.id"), nullable=True, index=True)
    image_id = Column(String, nullable=True)        # filename stem
    panel_id = Column(String, nullable=True)        # "R3-C7" or "R?-C?"
    class_ = Column("class", String, nullable=True) # 'class' is a Python keyword
    class_id = Column(Integer, nullable=True)
    severity = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    bbox = Column(Text, nullable=True)              # JSON "[x1,y1,x2,y2]"
    gps = Column(Text, nullable=True)               # JSON '{"lat":28.4,"lon":77.1}' or null
    created_at = Column(DateTime, default=datetime.utcnow)


class PanelFault(Base):
    """
    A persistent fault on a (park, panel, class) triple — tracks the SAME
    issue across multiple inspections so we can flag new / recurring / resolved.

    Identity is (park_id, panel_id, class_). Confidence values are aggregates
    across all detections that have ever been linked to this fault.
    """
    __tablename__ = "panel_faults"
    id = Column(Integer, primary_key=True, autoincrement=True)
    park_id = Column(String, ForeignKey("parks.id"), nullable=False, index=True)
    panel_id = Column(String, nullable=False)               # "R3-C7" or "R?-C?"
    class_ = Column("class", String, nullable=False)         # canonical class name
    class_id = Column(Integer, nullable=True)
    severity = Column(String, nullable=True)                # worst severity ever seen
    status = Column(String, default=FAULT_OPEN, index=True) # open | stale | resolved
    occurrences = Column(Integer, default=1)                # number of inspections this fault appeared in
    max_confidence = Column(Float, default=0.0)
    first_seen_inspection_id = Column(String, ForeignKey("inspections.id"), nullable=True)
    last_seen_inspection_id = Column(String, ForeignKey("inspections.id"), nullable=True)
    first_seen_date = Column(String, nullable=True)         # ISO date string
    last_seen_date = Column(String, nullable=True)
    last_bbox = Column(Text, nullable=True)                 # JSON last bbox (for UI preview)
    last_gps = Column(Text, nullable=True)                  # JSON last GPS
    notes = Column(Text, nullable=True)                     # operator notes
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Composite index to make upsert lookups fast.
Index(
    "ix_panel_faults_identity",
    PanelFault.park_id, PanelFault.panel_id, PanelFault.class_,
    unique=True,
)
