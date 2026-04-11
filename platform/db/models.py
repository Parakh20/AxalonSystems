"""SQLAlchemy ORM models for the Axalon solar inspection platform."""
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


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
    image_id = Column(String, nullable=True)        # filename stem
    panel_id = Column(String, nullable=True)        # "R3-C7" or "R?-C?"
    class_ = Column("class", String, nullable=True) # 'class' is a Python keyword
    class_id = Column(Integer, nullable=True)
    severity = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    bbox = Column(Text, nullable=True)              # JSON "[x1,y1,x2,y2]"
    gps = Column(Text, nullable=True)               # JSON '{"lat":28.4,"lon":77.1}' or null
    created_at = Column(DateTime, default=datetime.utcnow)
