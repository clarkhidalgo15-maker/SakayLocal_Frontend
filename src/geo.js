// Free address lookup for SakayLokal using OpenStreetMap's Nominatim
// reverse-geocoding service. No API key or billing account is required for
// light, non-commercial usage (see https://operations.osmfoundation.org/policies/nominatim/).

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const OSRM_URL = 'https://router.project-osrm.org';
const MAX_SNAP_DISTANCE_METERS = 80;
export const orientalMindoroCenter = [13.2, 121.2];
export const orientalMindoroBounds = [[12.1092496, 120.8006707], [13.5808426, 121.6971031]];

export function isWithinOrientalMindoroBounds(latitude, longitude) {
  const [[south, west], [north, east]] = orientalMindoroBounds;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= south && latitude <= north
    && longitude >= west && longitude <= east;
}

export async function snapToRoad(latitude, longitude, signal) {
  if (!isWithinOrientalMindoroBounds(latitude, longitude)) {
    throw new Error('Choose a location within Oriental Mindoro.');
  }

  const url = `${OSRM_URL}/nearest/v1/driving/${encodeURIComponent(longitude)},${encodeURIComponent(latitude)}?number=1&radiuses=${MAX_SNAP_DISTANCE_METERS}`;
  const response = await fetch(url, { signal });
  if (response.status === 400) {
    throw new Error('No mapped road was found within 80 meters. Try clicking closer to a road.');
  }
  if (!response.ok) throw new Error('Road snapping is temporarily unavailable.');

  const result = await response.json();
  const waypoint = result.code === 'Ok' ? result.waypoints?.[0] : null;
  const [snappedLongitude, snappedLatitude] = waypoint?.location || [];
  if (!Number.isFinite(snappedLatitude) || !Number.isFinite(snappedLongitude)
    || !Number.isFinite(waypoint.distance) || waypoint.distance > MAX_SNAP_DISTANCE_METERS) {
    throw new Error('No mapped road was found within 80 meters. Try clicking closer to a road.');
  }
  if (!isWithinOrientalMindoroBounds(snappedLatitude, snappedLongitude)) {
    throw new Error('The nearest mapped road is outside Oriental Mindoro. Choose a point inside the province.');
  }

  return {
    latitude: snappedLatitude,
    longitude: snappedLongitude,
    distance: Math.round(waypoint.distance),
    roadName: typeof waypoint.name === 'string' ? waypoint.name.trim() : '',
  };
}

export async function getDrivingRoute(origin, destination, signal) {
  const coordinates = [...origin, ...destination];
  if (coordinates.some(value => !Number.isFinite(value))
    || Math.abs(origin[0]) > 90 || Math.abs(destination[0]) > 90
    || Math.abs(origin[1]) > 180 || Math.abs(destination[1]) > 180) {
    throw new Error('Route origin or destination coordinates are invalid.');
  }

  const routeCoordinates = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
  const url = `${OSRM_URL}/route/v1/driving/${routeCoordinates}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Directions are temporarily unavailable. Please try again.');

  const result = await response.json();
  const route = result.code === 'Ok' ? result.routes?.[0] : null;
  const points = route?.geometry?.coordinates;
  if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)
    || !Array.isArray(points) || points.length < 2
    || points.some(point => !Array.isArray(point) || point.length < 2
      || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    throw new Error('No drivable route was found between these locations.');
  }

  return {
    points: points.map(([longitude, latitude]) => [latitude, longitude]),
    distance: route.distance,
    duration: route.duration,
    origin: [origin[0], origin[1]],
  };
}

// Reverse geocode a lat/lng into a readable address object.
export async function reverseGeocode(latitude, longitude, signal) {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`;
  const response = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error('Address lookup failed.');
  return response.json();
}

export function assertOrientalMindoroAddress(result) {
  const address = result?.address || {};
  const province = address.state || address.province || '';
  if (normalizePlace(province) !== 'oriental mindoro') {
    throw new Error('The selected road could not be verified as being within Oriental Mindoro. Choose another point inside the province.');
  }
}

// Pick the most useful components out of a Nominatim result.
export function addressSummary(result) {
  const a = (result && result.address) || {};
  const street = a.road || a.street || a.pedestrian || a.footway || a.path || a.cycleway || a.track || a.residential || '';
  const barangayCandidates = [
    a.suburb,
    a.hamlet,
    a.village,
    a.neighbourhood,
    a.locality,
    a.quarter,
    a.city_district,
    a.district,
    a.borough,
    a.residential,
  ]
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const barangay = barangayCandidates[0] || '';
  const city = a.municipality || a.town || a.city || a.county || '';
  const region = a.state || a.province || '';
  const displayName = (result && result.display_name) || '';
  return { street, barangay, barangayCandidates, city, region, displayName };
}

export function formatRoadLocation(summary, roadName = summary.street) {
  const place = [summary.barangay, summary.city].filter(Boolean).join(', ');
  return roadName
    ? [roadName, summary.barangay, summary.city].filter(Boolean).join(', ')
    : `Unnamed mapped road${place ? ` near ${place}` : ''}`;
}

export function findMatchingArea(areas, city, barangay) {
  const normalizedCity = normalizePlace(city);
  const candidates = (Array.isArray(barangay) ? barangay : [barangay])
    .map(normalizePlace)
    .filter(Boolean);
  if (!candidates.length) return null;

  const cityExists = normalizedCity
    && areas.some(area => normalizePlace(area.city) === normalizedCity);

  for (const candidate of candidates) {
    const matches = areas.filter(area => normalizePlace(area.name) === candidate
      && (!cityExists || normalizePlace(area.city) === normalizedCity));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// Normalize place names so "Calapan City" and "Calapan" compare equal.
export function normalizePlace(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^\s*(barangay|brgy)\s+/g, '')
    .replace(/\s*(city|municipality)\s*$/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}