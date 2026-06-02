from axalon.db.models import Mission, Park


def test_mission_model_persists(db_session):
    park = Park(id="PARK_PLAN", name="Plan Park")
    db_session.add(park)
    db_session.flush()
    m = Mission(
        name="Grid #1",
        park_id="PARK_PLAN",
        mission_type="grid",
        camera_id="itl612r-pro",
        params='{"altitudeM": 20}',
        polygon='[{"lat": 18.5, "lon": 73.8}]',
        waypoints='[{"lat": 18.5, "lon": 73.8, "alt": 20}]',
        area_ha=4.2,
        image_count=312,
    )
    db_session.add(m)
    db_session.commit()
    fetched = db_session.query(Mission).filter_by(name="Grid #1").first()
    assert fetched.mission_type == "grid"
    assert fetched.camera_id == "itl612r-pro"
    assert fetched.area_ha == 4.2
