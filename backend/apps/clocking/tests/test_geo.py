"""Tests for services/geo.py."""
from django.test import SimpleTestCase

from services.geo import haversine, is_within_radius


class HaversineTests(SimpleTestCase):
    def test_zero_distance_for_identical_points(self):
        # Spec: même point → 0m
        self.assertEqual(haversine(48.8566, 2.3522, 48.8566, 2.3522), 0.0)

    def test_paris_to_lyon_known_distance(self):
        # Spec: Paris→Lyon ≈ 391 000 m (±500 m).
        # Notre-Dame (Paris) ↔ Hôtel-de-Ville (Lyon).
        d = haversine(48.8530, 2.3499, 45.7670, 4.8358)
        self.assertAlmostEqual(d, 391_000, delta=2_000)

    def test_short_distance_meters_scale(self):
        # 1° lat ≈ 111 km → 0.0008983° ≈ 100 m at the equator.
        self.assertAlmostEqual(haversine(0.0, 0.0, 0.000_898_3, 0.0), 100, delta=0.5)

    def test_symmetry(self):
        a = haversine(48.8566, 2.3522, 51.5074, -0.1278)  # Paris ↔ London
        b = haversine(51.5074, -0.1278, 48.8566, 2.3522)
        self.assertAlmostEqual(a, b, places=3)

    def test_antipodes_half_circumference(self):
        d = haversine(0.0, 0.0, 0.0, 180.0)
        self.assertAlmostEqual(d / 1000, 20_015, delta=5)


class IsWithinRadiusTests(SimpleTestCase):
    def test_inside_radius(self):
        self.assertTrue(is_within_radius(48.8566, 2.3522, 48.8567, 2.3523, radius_m=150))

    def test_outside_radius(self):
        self.assertFalse(is_within_radius(48.8566, 2.3522, 48.8700, 2.3522, radius_m=150))

    def test_exactly_on_boundary_is_inside(self):
        self.assertTrue(is_within_radius(0.0, 0.0, 0.000_898_3, 0.0, radius_m=100))
