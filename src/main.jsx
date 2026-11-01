import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CircleMarker, MapContainer, Marker, Popup, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { adminRequest, getAccount, getAdvisories, getAreas, getMyReports, getPublicAsset, getReport, getRoutes, getTerminals, login, register, submitReport, updateAccount } from './api';
import { initScrollReveal, setDocumentTitle } from './reveal';
import { addressSummary, assertOrientalMindoroAddress, findMatchingArea, formatRoadLocation, getDrivingRoute, normalizePlace, orientalMindoroCenter, reverseGeocode, snapToRoad } from './geo';
import './styles.css';
import 'leaflet/dist/leaflet.css';

const terminals = [
  { id: 1, name: 'Calapan Central Terminal', address: 'J.P. Rizal St., Poblacion', area: 'Poblacion, Calapan City', hours: '4:30 AM - 10:00 PM', vehicles: ['Jeepney', 'Bus'], codes: ['J1', 'B3'], lat: 13.41172, lng: 121.18024 },
  { id: 2, name: 'Calapan Public Market Terminal', address: 'Public Market Road, Poblacion', area: 'Poblacion, Calapan City', hours: '5:00 AM - 9:00 PM', vehicles: ['Jeepney', 'Tricycle'], codes: ['J2', 'T1'], lat: 13.41439, lng: 121.18145 },
  { id: 3, name: 'Victoria UV Van Terminal', address: 'Calapan North Road, Brgy. Lumangbayan', area: 'Lumangbayan, Calapan City', hours: '5:00 AM - 8:00 PM', vehicles: ['UV Van'], codes: ['V4'], lat: 13.41834, lng: 121.17791 },
  { id: 4, name: 'Naujan-Calapan Bus Terminal', address: 'Calapan North Road, Brgy. San Vicente', area: 'San Vicente, Calapan City', hours: '24 hours', vehicles: ['Bus'], codes: ['B3', 'B5'], lat: 13.42464, lng: 121.18403 },
];

const calapanCenter = [13.4117, 121.1803];
const openStreetMapDirectionsUrl = (origin, destination) => `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(`${origin[0]},${origin[1]};${destination[0]},${destination[1]}`)}`;
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

class AppErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <main className="error-page"><h1>Something went wrong</h1><p>The page could not finish loading.</p><button className="button yellow" onClick={() => this.setState({ error: null })}>Try again</button><a className="button outline" href="/admin">Admin dashboard</a></main>;
    }
    return this.props.children;
  }
}

function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <AppErrorBoundary key={`${location.pathname}${location.search}`}>{children}</AppErrorBoundary>;
}

function Loading({ label = 'Loading...' }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="spinner" /><span>{label}</span><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span></div>;
}
const PopUpsContext = createContext(null);

function usePopUps() {
  return useContext(PopUpsContext);
}

const POPUP_TONES = {
  error: { icon: '×', iconClass: 'icon-error', button: 'danger', label: 'ERROR' },
  warning: { icon: '!', iconClass: 'icon-warning', button: 'yellow', label: 'WARNING' },
  success: { icon: '✓', iconClass: 'icon-success', button: 'green', label: 'SUCCESS' },
  info: { icon: 'i', iconClass: 'icon-info', button: 'dark', label: 'NOTICE' },
};

function PopUpsProvider({ children }) {
  const [popup, setPopup] = useState(null);
  const hidePopUp = () => setPopup(null);
  const showPopUp = options => setPopup(options ? { kind: 'info', ...options, onClose: () => { setPopup(null); options.onClose?.(); } } : null);
  const confirmAction = (arg = {}) => {
    const options = typeof arg === 'string' ? { message: arg } : arg;
    return new Promise(resolve => {
      setPopup({
        kind: options.danger ? 'error' : 'warning',
        title: options.title || 'Are you sure?',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Yes',
        cancelLabel: options.cancelLabel || 'Cancel',
        onConfirm: () => { setPopup(null); resolve(true); },
        onClose: () => { setPopup(null); resolve(false); },
      });
    });
  };
  return (
    <PopUpsContext.Provider value={{ showPopUp, hidePopUp, confirmAction }}>
      {children}
      {popup && <PopUpModal popup={popup} />}
    </PopUpsContext.Provider>
  );
}

function PopUpModal({ popup }) {
  const tone = POPUP_TONES[popup.kind] || POPUP_TONES.info;
  const isConfirm = Boolean(popup.onConfirm);
  return (
    <div className="modal-backdrop" role="presentation"
         onMouseDown={event => { if (event.target === event.currentTarget && !isConfirm) popup.onClose(); }}>
      <section className="confirm-modal app-popup" role="alertdialog" aria-modal="true" aria-labelledby="app-popup-title">
        <div className={`modal-icon ${tone.iconClass}`}>{tone.icon}</div>
        <span className="eyebrow">{tone.label}</span>
        <h2 id="app-popup-title">{popup.title}</h2>
        <p>{popup.message}</p>
        <div className="modal-actions">
          {isConfirm ? (
            <>
              <button className="button outline" type="button" onClick={popup.onClose}>{popup.cancelLabel || 'Cancel'}</button>
              <button className={`button ${tone.button}`} type="button" onClick={popup.onConfirm}>{popup.confirmLabel || 'OK'}</button>
            </>
          ) : (
            <button className={`button ${tone.button}`} type="button" onClick={popup.onClose}>OK</button>
          )}
        </div>
      </section>
    </div>
  );
}



function Pagination({ meta, onChange }) {
  if (!meta || Number(meta.pages) <= 1) return null;
  return <div className="pagination" aria-label="Pagination"><button className="button outline small" disabled={Number(meta.page) <= 1} onClick={() => onChange(Number(meta.page) - 1)}>Previous</button><span>Page {meta.page} of {meta.pages} · {meta.total} records</span><button className="button outline small" disabled={Number(meta.page) >= Number(meta.pages)} onClick={() => onChange(Number(meta.page) + 1)}>Next</button></div>;
}

function RouteTransition({ children }) {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setDocumentTitle(location.pathname);
    initScrollReveal(document.querySelector('.route-transition'));
  }, [location.pathname, location.search]);
  return <div className="route-transition" key={`${location.pathname}${location.search}`}>{children}<ScrollTopButton /></div>;
}

function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible((window.scrollY || window.pageYOffset || document.documentElement.scrollTop) > 420);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <button type="button" className={`scroll-top ${visible ? 'visible' : ''}`} aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span className="arrow" aria-hidden="true">↑</span></button>;
}

function LocationSelectors({ areas, city, barangay, onCityChange, onBarangayChange, cityLabel = 'Municipality or city', barangayLabel = 'Barangay' }) {
  const cities = [...new Set(areas.map(area => area.city).filter(Boolean))].sort();
  const barangays = areas.filter(area => area.city === city).sort((a, b) => a.name.localeCompare(b.name));
  return <div className="location-filter">
    <label>{cityLabel}<select value={city} onChange={event => onCityChange(event.target.value)} required><option value="">Select municipality/city</option>{cities.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>{barangayLabel}<select value={barangay} onChange={event => onBarangayChange(event.target.value)} disabled={!city} required><option value="">Select barangay or center</option>{barangays.map(area => <option key={area.id} value={area.name}>{area.name === 'Municipal Center' ? 'Municipal Center' : area.name}</option>)}</select></label>
  </div>;
}

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const passenger = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
  const administrator = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  const account = passenger?.role === 'passenger' && !administrator?.access_token ? passenger : null;
  useEffect(() => setMobileNavOpen(false), [location.pathname]);
  const logout = () => {
    localStorage.removeItem('sakaylokal_user');
    localStorage.removeItem('sakaylokal_admin');
    navigate('/login');
  };
  return <header className="topbar"><Link className="brand" to="/"><span className="brand-mark">↗</span><span>SakayLokal</span></Link><nav>
    <Link className={location.pathname === '/' ? 'active' : ''} to="/">Home</Link>
    <Link className={location.pathname.startsWith('/terminals') ? 'active' : ''} to="/terminals">Terminals</Link>
    <Link className={location.pathname === '/route-search' ? 'active' : ''} to="/route-search">Routes & Fares</Link>
    <Link className={location.pathname.startsWith('/reports') ? 'active' : ''} to="/reports/create">Report an issue</Link>
    <Link className={location.pathname === '/reports/track' ? 'active' : ''} to="/reports/track">Track a report</Link>
  </nav><div className="topbar-actions">{account?.access_token ? <div className="account-actions"><Link className="button outline small account-settings-link" to="/account">{account.profile_photo ? <img className="header-avatar" src={getPublicAsset(account.profile_photo)} alt="" /> : <span className="header-account-icon">{account.full_name?.slice(0, 1)?.toUpperCase() || 'U'}</span>}Account settings</Link><button className="button yellow small" onClick={logout}>Log out</button></div> : administrator?.access_token ? <div className="account-actions"><Link className="button outline small admin-dashboard-link" to="/admin">Admin dashboard</Link><button className="button yellow small" onClick={logout}>Log out</button></div> : <Link className="button yellow small" to="/login">Log in</Link>}<button className="mobile-nav-toggle" type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(open => !open)}><span /><span /><span /></button></div><nav className={`mobile-nav ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Mobile navigation">
    <Link className={location.pathname === '/' ? 'active' : ''} to="/">Home</Link>
    <Link className={location.pathname.startsWith('/terminals') ? 'active' : ''} to="/terminals">Terminals</Link>
    <Link className={location.pathname === '/route-search' ? 'active' : ''} to="/route-search">Routes & Fares</Link>
    <Link className={location.pathname.startsWith('/reports') ? 'active' : ''} to="/reports/create">Report an issue</Link>
    <Link className={location.pathname === '/reports/track' ? 'active' : ''} to="/reports/track">Track a report</Link>
  </nav></header>;
}

function MapClickHandler({ onSelect, onZoom, showMarker }) {
  const [selectedPoint, setSelectedPoint] = useState(null);
  useMapEvents({
    click: async event => {
      if (event.target.getZoom() < 15) {
        event.target.setView(event.latlng, 16);
        setSelectedPoint([event.latlng.lat, event.latlng.lng]);
        onZoom?.();
        return;
      }
      setSelectedPoint(null);
      const point = await onSelect?.(event.latlng.lat, event.latlng.lng);
      if (point) setSelectedPoint([Number(point.lat), Number(point.lng)]);
    },
  });
  return selectedPoint && showMarker
    ? <Marker position={selectedPoint} icon={markerIcon}><Popup>Pin snapped to the nearest mapped road</Popup></Marker>
    : null;
}

function FitMapToRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [28, 28] });
  }, [map, points]);
  return null;
}

function FocusMapOnLocation({ location }) {
  const map = useMap();
  const latitude = location?.[0];
  const longitude = location?.[1];
  useEffect(() => {
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [map, latitude, longitude]);
  return null;
}

function MapPanel({ label = 'Calapan City, Oriental Mindoro', route = false, routePoints: customRoutePoints = null, routeMarkers = [], currentLocation = null, focusTerminal = null, terminalItems = terminals, interactive = false, onLocationSelect, onLocationZoom }) {
  const points = terminalItems.map(terminal => [Number(terminal.lat), Number(terminal.lng)]);
  const routePoints = customRoutePoints || (route ? points : []);
  const marker = !interactive && focusTerminal && Number.isFinite(Number(focusTerminal.lat)) && Number.isFinite(Number(focusTerminal.lng)) ? focusTerminal : null;
  return <div className={`map-panel leaflet-panel ${interactive ? 'map-picker' : ''}`}><MapContainer center={interactive ? orientalMindoroCenter : marker ? [Number(marker.lat), Number(marker.lng)] : calapanCenter} zoom={interactive ? 8 : 14} minZoom={interactive ? 8 : undefined} scrollWheelZoom={!interactive}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
    {interactive && <MapClickHandler onSelect={onLocationSelect} onZoom={onLocationZoom} showMarker />}
    {currentLocation && <FocusMapOnLocation location={currentLocation} />}
    {routePoints.length > 1 && <FitMapToRoute points={routePoints} />}
    {route && routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ color: '#ffc52f', weight: 6, opacity: 0.9 }} />}
    {routeMarkers.length > 1 && routePoints.length < 2 && <FitMapToRoute points={routeMarkers.map(item => [Number(item.lat), Number(item.lng)])} />}
    {currentLocation && <CircleMarker center={currentLocation} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1683d8', fillOpacity: 1 }}><Popup>Your current location</Popup></CircleMarker>}
    {routeMarkers.map((terminal, index) => <Marker key={`${terminal.id || terminal.name}-${index}`} position={[Number(terminal.lat), Number(terminal.lng)]} icon={markerIcon}><Popup>{index === 0 ? 'Route origin' : 'Route destination'}<br /><b>{terminal.name}</b></Popup></Marker>)}
    {marker && <Marker position={[Number(marker.lat), Number(marker.lng)]} icon={markerIcon}><Popup>{marker.name || 'Selected terminal location'}</Popup></Marker>}
    {terminalItems.map(terminal => <Marker key={terminal.id} position={[Number(terminal.lat), Number(terminal.lng)]} icon={markerIcon}><Popup><b>{terminal.name}</b><br />{terminal.address}<br /><Link to={`/terminals/${terminal.id}`}>View terminal</Link></Popup></Marker>)}
  </MapContainer><span className="map-label">Leaflet + OpenStreetMap · {label}</span></div>;
}

function TerminalCard({ terminal, compact = false }) {
  return <Link to={`/terminals/${terminal.id}`} className={`card terminal-card ${compact ? 'compact' : ''}`}><div className="terminal-card-top"><span className="terminal-type">TRANSPORT STOP</span><b className="open"><span className="status-dot" />Open</b></div><div className="card-title"><h3>{terminal.name}</h3><span className="terminal-arrow">↗</span></div><p className="terminal-address"><span>⌖</span>{terminal.address}</p><div className="terminal-meta"><span>◷ {terminal.hours || 'Hours not listed'}</span><span>{terminal.city || 'Oriental Mindoro'}</span></div><div className="chips">{terminal.vehicles.length ? terminal.vehicles.map(vehicle => <span className="chip" key={vehicle}>{vehicle}</span>) : <span className="chip muted-chip">Transport services</span>}</div><div className="terminal-card-footer"><span>View terminal details</span><span>→</span></div></Link>;
}

function Home() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [routeItems, setRouteItems] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const popUps = usePopUps();
  useEffect(() => { Promise.all([getTerminals(), getRoutes(), getAdvisories()]).then(([terminalResult, routeResult, advisoryResult]) => { setItems(terminalResult.data || []); setRouteItems(routeResult.data || []); setAdvisories(advisoryResult.data || []); }).catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load the home feed', message: error?.message || 'The transport service might be offline at the moment.' })).finally(() => setLoading(false)); }, []);
  const mapItems = items.map(item => ({ ...item, lat: Number(item.lat), lng: Number(item.lng), vehicles: item.vehicle_types ? item.vehicle_types.split(',').map(v => v.replace('_', ' ')) : [], codes: [] }));
  return <><Header /><main><section className="hero"><div><h1>Find where to ride, and<br />what it costs.</h1><p>Terminals, routes, fares and schedules for Calapan City, Oriental Mindoro, plus a way to report problems and ask for help.</p><form className="search-box" onSubmit={event => { event.preventDefault(); navigate(`/terminals${query ? `?q=${encodeURIComponent(query)}` : ''}`); }}><div className="tabs"><b>Find a terminal</b><Link to="/route-search">Route and fare</Link></div><div className="search-row"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Area or barangay, e.g. Poblacion" /><button className="button yellow">Show terminals</button></div><div className="popular"><span>Popular:</span>{['Jeepney', 'Bus', 'Tricycle', 'UV Van'].map(vehicle => <button type="button" className="chip chip-button" key={vehicle} onClick={() => { setQuery(vehicle); navigate(`/terminals?q=${vehicle}`); }}>● {vehicle}</button>)}</div></form></div><MapPanel terminalItems={mapItems} /></section><section className="section"><div className="section-heading"><h2>Terminals in Calapan City</h2><Link to="/terminals">See all terminals</Link></div>{loading ? <Loading label="Loading terminals..." /> : <div className="grid three">{mapItems.slice(0, 3).map(t => <TerminalCard key={t.id} terminal={t} compact />)}</div>}{!loading && items.length === 0 && <div className="card"><h3>No published terminals yet</h3><p>Transport records will appear here after a municipality staff member submits them and the super admin publishes them.</p><Link className="button outline small" to="/login">Admin login</Link></div>}<div className="home-lower"><div><h2>Something went wrong on your trip?</h2><div className="grid two"><Link className="card action-card" to="/reports/create?type=complaint"><h3>Complaint</h3><p>Overcharging, rude service, long waits.</p></Link><Link className="card action-card" to="/reports/create?type=incident"><h3>Incident report</h3><p>Accidents, breakdowns, safety concerns.</p></Link><Link className="card action-card" to="/reports/create?type=assistance"><h3>Assistance request</h3><p>Need help with a trip or a terminal.</p></Link><Link className="card action-card" to="/reports/create?type=feedback"><h3>Rate a service</h3><p>Tell others how a route or terminal is.</p></Link></div></div><aside><h2>Advisories</h2>{advisories.length ? advisories.slice(0, 3).map(advisory => <div className="card advisory" key={advisory.id}><b>{advisory.title}</b><p>{advisory.body}</p><span className="advisory-type">{advisory.advisory_type}</span></div>) : <div className="card advisory"><b>No current advisories</b><p>Check back for the latest route updates and announcements.</p></div>}<Link className="card weather advisory-link" to="https://open-meteo.com/" target="_blank" rel="noreferrer"><div><b>Calapan City weather</b><p>Open the weather service for current conditions</p></div><strong>☀</strong></Link></aside></div></section></main><Footer /></>;
}

function Terminals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [items, setItems] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [barangay, setBarangay] = useState(searchParams.get('barangay') || '');
  const [demoMode, setDemoMode] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const popUps = usePopUps();
  useEffect(() => {
    getTerminals().then(result => {
      if (Array.isArray(result.data)) {
        setItems(result.data.map(item => ({ ...item, vehicles: item.vehicle_types ? item.vehicle_types.split(',').map(v => v.replace('_', ' ')) : [], codes: [] })));
        setDemoMode(false);
      }
    }).catch(exception => { const message = exception.message || 'Could not load terminals.'; setError(message); popUps.showPopUp({ kind: 'error', title: 'Could not load the terminal directory', message }); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { getAreas().then(result => setAreas(result.data || [])).catch(() => {}); }, []);
  const [vehicleFilter, setVehicleFilter] = useState('');
  const cities = [...new Set(areas.map(area => area.city))];
  const barangays = areas.filter(area => area.city === city && area.name !== 'Municipal Center').map(area => area.name);
  const updateLocation = (nextCity, nextBarangay = '') => {
    setCity(nextCity);
    setBarangay(nextBarangay);
    setSearchParams(params => {
      if (nextCity) params.set('city', nextCity); else params.delete('city');
      if (nextBarangay) params.set('barangay', nextBarangay); else params.delete('barangay');
      return params;
    });
  };
  const updateQuery = value => {
    setQuery(value);
    if (userLocation) setUserLocation(null);
    setSearchParams(params => {
      if (value) params.set('q', value); else params.delete('q');
      return params;
    });
  };
  const distanceInKm = (latitude, longitude) => {
    if (!userLocation) return null;
    const earthRadius = 6371;
    const latDelta = (Number(latitude) - userLocation.latitude) * Math.PI / 180;
    const lngDelta = (Number(longitude) - userLocation.longitude) * Math.PI / 180;
    const a = Math.sin(latDelta / 2) ** 2 + Math.cos(userLocation.latitude * Math.PI / 180) * Math.cos(Number(latitude) * Math.PI / 180) * Math.sin(lngDelta / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const filtered = items
    .filter(t => (!userLocation && `${t.name} ${t.address} ${t.area || ''} ${t.city || ''}`.toLowerCase().includes(query.toLowerCase())) && (!city || t.city === city) && (!barangay || t.area === barangay) && (!vehicleFilter || t.vehicles.some(vehicle => vehicle.toLowerCase().includes(vehicleFilter.toLowerCase()))))
    .map(t => ({ ...t, distanceKm: distanceInKm(t.lat, t.lng) }))
    .filter(t => !userLocation || t.distanceKm <= 25)
    .sort((a, b) => userLocation ? a.distanceKm - b.distanceKm : 0);
  const useLocation = () => {
    if (!navigator.geolocation) {
      const message = 'Location is not supported by this browser. Search by city, barangay, or terminal instead.';
      setLocationError(message);
      popUps.showPopUp({ kind: 'warning', title: 'Location is not supported', message });
      return;
    }
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      position => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setQuery('');
        setCity('');
        setBarangay('');
        setSearchParams(params => { params.delete('q'); params.delete('city'); params.delete('barangay'); return params; });
      },
      () => { const message = 'We could not access your location. Allow location permission or search by city, barangay, or terminal instead.'; setLocationError(message); popUps.showPopUp({ kind: 'warning', title: 'Location unavailable', message }); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };
  return <><Header /><main className="page terminal-directory"><div className="breadcrumb">Transport directory / {city || 'Oriental Mindoro'}{barangay ? ` / ${barangay}` : ''}</div><section className="directory-hero"><div><span className="eyebrow">SAKAYLOKAL DIRECTORY</span><h1>Find your next<br /><span>transport stop.</span></h1><p>Explore verified terminals and pick-up spots across Oriental Mindoro. Select a location to narrow your search.</p></div><div className="directory-stat"><strong>{items.length}</strong><span>active terminals<br />in the directory</span></div></section><section className="directory-controls card"><div className="controls-heading"><div><span className="eyebrow">STEP 1</span><h2>Choose your location</h2></div><button className="button outline small" type="button" onClick={() => { updateLocation(''); updateQuery(''); setVehicleFilter(''); setUserLocation(null); setLocationError(''); }}>Clear filters</button></div><div className="location-filter"><label>Municipality or city<select value={city} onChange={e => updateLocation(e.target.value)}><option value="">All Oriental Mindoro</option>{cities.map(value => <option key={value}>{value}</option>)}</select></label><label>Barangay<select value={barangay} onChange={e => updateLocation(city, e.target.value)} disabled={!city}><option value="">All barangays</option>{barangays.map(value => <option key={value}>{value}</option>)}</select></label></div><div className="directory-search"><label>Search by terminal or landmark<input value={query} onChange={e => updateQuery(e.target.value)} placeholder="e.g. Poblacion, public market" /></label><button className="button dark" type="button" onClick={useLocation}>⌖ Use my location</button></div>{locationError && <p className="error location-message" role="alert">{locationError}</p>}{userLocation && <p className="location-message success-text">Showing terminals within 25 km of your location ({userLocation.latitude.toFixed(3)}, {userLocation.longitude.toFixed(3)}). The blue dot marks your location on the map.</p>}<div className="vehicle-filter"><span>Vehicle type</span><div className="chips"><button type="button" className={`chip chip-button ${!vehicleFilter ? 'selected' : ''}`} onClick={() => setVehicleFilter('')}>All services</button>{['Jeepney', 'Bus', 'Tricycle', 'UV Van'].map(vehicle => <button type="button" className={`chip chip-button ${vehicleFilter === vehicle ? 'selected' : ''}`} key={vehicle} onClick={() => setVehicleFilter(vehicle)}>{vehicle}</button>)}</div></div></section><div className="directory-toolbar"><div><span className="eyebrow">STEP 2 · RESULTS</span><h2>{userLocation ? 'Terminals near you' : city ? `${city}${barangay ? ` · ${barangay}` : ''}` : 'All transport stops'}</h2></div><strong>{filtered.length} result{filtered.length === 1 ? '' : 's'}</strong></div>{error && <div className="card error-card"><h3>We could not load the directory</h3><p>{error}</p><button className="button outline small" type="button" onClick={() => window.location.reload()}>Try again</button></div>}{loading ? <Loading label="Loading transport stops..." /> : <div className="directory-layout"><section className="terminal-results">{filtered.length ? filtered.map(t => <TerminalCard key={t.id} terminal={t} />) : <div className="card selection-empty"><div className="empty-icon">⌖</div><h3>No terminals found</h3><p>{userLocation ? 'There are no active terminals within 25 km of your location.' : 'Try another barangay, vehicle type, or search term. Admin can add a terminal under the selected location.'}</p></div>}</section><section className="directory-map"><div className="map-heading"><div><span className="eyebrow">LIVE MAP</span><h2>Nearby transport stops</h2></div><span className="map-count">{filtered.length} terminal{filtered.length === 1 ? '' : 's'}{userLocation ? ' + you' : ''}</span></div><MapPanel terminalItems={filtered} currentLocation={userLocation ? [userLocation.latitude, userLocation.longitude] : null} label={`${userLocation ? 'Nearby' : (city || 'Oriental Mindoro')} transport map`} /></section></div>}</main></>;
}

function TerminalDetails() {
  const { id } = useParams();
  const terminalId = Number(id);
  const [terminal, setTerminal] = useState(null);
  const [directions, setDirections] = useState(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [directionsError, setDirectionsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const popUps = usePopUps();
  useEffect(() => { getTerminals().then(result => { const item = (result.data || []).find(row => Number(row.id) === terminalId); if (!item) throw new Error('Terminal not found or no longer active.'); setTerminal({ ...item, vehicles: item.vehicle_types ? item.vehicle_types.split(',').map(v => v.replace('_', ' ')) : [], codes: [] }); }).catch(exception => { const message = exception.message || 'Terminal could not be loaded.'; setError(message); popUps.showPopUp({ kind: 'error', title: 'Terminal unavailable', message }); }).finally(() => setLoading(false)); }, [terminalId]);
  if (loading) return <><Header /><main className="page"><Loading label="Loading terminal..." /></main></>;
  if (error || !terminal) return <><Header /><main className="page"><div className="card"><h1>Terminal unavailable</h1><p>{error || 'This terminal is no longer active.'}</p><Link className="button dark" to="/terminals">Back to terminals</Link></div></main></>;
  const openDirections = async () => {
    setDirections(null);
    setDirectionsError('');
    if (!navigator.geolocation) {
      setDirectionsError('This browser does not support location access. Enable location services or try another browser.');
      return;
    }
    setDirectionsLoading(true);
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
      });
      const route = await getDrivingRoute(
        [position.coords.latitude, position.coords.longitude],
        [Number(terminal.lat), Number(terminal.lng)]
      );
      setDirections(route);
    } catch (exception) {
      const message = exception.code === 1
        ? 'Location permission was denied. Allow location access in your browser, then try again.'
        : exception.code === 2
          ? 'Your current location is unavailable. Check that location services are turned on, then try again.'
          : exception.code === 3
            ? 'Finding your location took too long. Move to an area with a better GPS signal and try again.'
            : exception.message || 'Could not get directions. Please try again.';
      setDirectionsError(message);
      popUps.showPopUp({ kind: 'warning', title: 'Could not get directions', message });
    } finally {
      setDirectionsLoading(false);
    }
  };
  const terminalRoutes = (terminal.route_data || '').split('|').filter(Boolean).map(value => { const [routeId, name, vehicle] = value.split(':'); return { id: routeId, code: name.slice(0, 2).toUpperCase(), name, vehicle, fare: 'Check fare', time: 'Check schedule' }; });
  const routeDistance = directions && directions.distance >= 1000
    ? `${(directions.distance / 1000).toFixed(1)} km`
    : directions ? `${Math.round(directions.distance)} m` : '';
  const routeDuration = directions ? `${Math.max(1, Math.round(directions.duration / 60))} min` : '';
  return <><Header /><main className="page"><p className="breadcrumb">Terminals / Calapan City / {terminal.name}</p><div className="title-row"><div><h1>{terminal.name}</h1><p><b className="open">Open now</b> · {terminal.hours}</p></div><div className="actions"><button type="button" className="button outline" onClick={openDirections} disabled={directionsLoading}>{directionsLoading ? 'Finding your location...' : 'Get directions'}</button><Link className="button outline" to="/reports/create">Report an issue here</Link><Link className="button yellow" to="/reports/create">Rate this terminal</Link></div></div>{directionsError && <p className="error" role="alert">{directionsError}</p>}{directions && <p className="field-help" role="status">Route from your current location to {terminal.name}: {routeDistance}, about {routeDuration} by car.</p>}<div className="split detail-top"><div><MapPanel focusTerminal={terminal} terminalItems={[]} route={Boolean(directions)} routePoints={directions?.points || []} currentLocation={directions?.origin || null} label={directions ? 'Route from your current location' : 'Calapan City, Oriental Mindoro'} /><div className="card details"><p><b>Address</b><span>{terminal.address}, Calapan City</span></p><p><b>Landmark</b><span>{terminal.landmark || 'Not specified'}</span></p><p><b>Contact</b><span>{terminal.contact_no || 'Not specified'}</span></p><p><b>Vehicles</b><span className="chips">{terminal.vehicles.map(v => <span className="chip" key={v}>{v}</span>)}</span></p><p><b>Location</b><span>{terminal.lat}, {terminal.lng}</span></p></div></div><div className="card"><h2>Routes that stop here</h2>{terminalRoutes.length ? terminalRoutes.map(r => <div className="route-line" key={r.id}><b className={`code code-${r.code[0]}`}>{r.code}</b><div><b>{r.name}</b><span>{r.vehicle}</span></div><span>{r.fare}</span><span>{r.time}</span></div>) : <p>No active routes are assigned to this terminal yet.</p>}</div></div></main></>;
}

function RouteSearch() {
  const [items, setItems] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCity, setFromCity] = useState('');
  const [fromBarangay, setFromBarangay] = useState('');
  const [toCity, setToCity] = useState('');
  const [toBarangay, setToBarangay] = useState('');
  const [searched, setSearched] = useState(true);
  const [error, setError] = useState('');
  const popUps = usePopUps();
  useEffect(() => { Promise.all([getRoutes(), getTerminals(), getAreas()]).then(([routeResult, terminalResult, areaResult]) => { if (Array.isArray(routeResult.data)) setItems(routeResult.data.map(item => ({ ...item, code: item.name.slice(0, 2).toUpperCase(), fare: `₱${item.fare || '0'}`, time: 'Estimated', detail: `${item.origin} to ${item.destination} · ${item.schedule || 'Check schedule'}`, points: (item.map_points || '').split('|').filter(Boolean).map(point => point.split(',').map(Number)) }))); setTerminals(terminalResult.data || []); setAreas(areaResult.data || []); }).catch(exception => { const message = exception.message || 'Could not load live routes.'; setError(message); popUps.showPopUp({ kind: 'error', title: 'Could not load routes', message }); }); }, []);
  const filteredTerminals = (city, barangay) => terminals.filter(terminal => (!city || terminal.city === city) && (!barangay || terminal.area === barangay));
  const visibleItems = items.filter(item => !from || !to || (item.origin.toLowerCase().includes(from.toLowerCase()) && item.destination.toLowerCase().includes(to.toLowerCase())));
  const mapPoints = selectedRoute?.points?.length > 1 ? selectedRoute.points : terminals.map(terminal => [Number(terminal.lat), Number(terminal.lng)]);
  const routeOrigin = selectedRoute && terminals.find(terminal => terminal.name === selectedRoute.origin);
  const routeDestination = selectedRoute && terminals.find(terminal => terminal.name === selectedRoute.destination);
  const directionsUrl = routeOrigin && routeDestination
    ? openStreetMapDirectionsUrl([routeOrigin.lat, routeOrigin.lng], [routeDestination.lat, routeDestination.lng])
    : '';
  return <><Header /><main className="page route-search-page">
    <header className="route-search-heading">
      <span className="eyebrow">PLAN YOUR TRIP</span>
      <h1>Route and fare search</h1>
      <p className="lead">Choose where you are starting and where you want to go. Select each location and terminal manually.</p>
    </header>
    <form className="card route-search-form" onSubmit={event => { event.preventDefault(); setSearched(true); setSelectedRoute(null); }}>
      <div className="route-endpoints">
        <section className="route-endpoint">
          <div className="route-endpoint-heading"><span>1</span><div><h2>From</h2><p>Choose your starting point</p></div></div>
          <LocationSelectors areas={areas} city={fromCity} barangay={fromBarangay} onCityChange={value => { setFromCity(value); setFromBarangay(''); setFrom(''); setSearched(false); }} onBarangayChange={value => { setFromBarangay(value); setFrom(''); setSearched(false); }} />
          <label>Starting terminal<select value={from} onChange={event => { setFrom(event.target.value); setSearched(false); }} required disabled={!fromBarangay}><option value="">Select starting terminal</option>{filteredTerminals(fromCity, fromBarangay).map(terminal => <option key={terminal.id} value={terminal.name}>{terminal.name}</option>)}</select></label>
        </section>
        <section className="route-endpoint">
          <div className="route-endpoint-heading"><span>2</span><div><h2>To</h2><p>Choose your destination</p></div></div>
          <LocationSelectors areas={areas} city={toCity} barangay={toBarangay} onCityChange={value => { setToCity(value); setToBarangay(''); setTo(''); setSearched(false); }} onBarangayChange={value => { setToBarangay(value); setTo(''); setSearched(false); }} />
          <label>Destination terminal<select value={to} onChange={event => { setTo(event.target.value); setSearched(false); }} required disabled={!toBarangay}><option value="">Select destination terminal</option>{filteredTerminals(toCity, toBarangay).map(terminal => <option key={terminal.id} value={terminal.name}>{terminal.name}</option>)}</select></label>
        </section>
      </div>
      <div className="route-search-actions">
        <p>Pick a municipality, barangay, and terminal for both trip endpoints.</p>
        <button className="button yellow" disabled={!from || !to}>Search routes</button>
      </div>
    </form>
    {searched
      ? <div className="split route-results">
        <div>
          <h2>{from && to ? `${visibleItems.length} ways to get there` : 'All available routes'}</h2>
          {visibleItems.map(routeItem => <Link className="card route-result route-result-link" key={routeItem.id} to={`/routes/${routeItem.id}`}>
            <b className={`code code-${routeItem.code[0]}`}>{routeItem.code}</b>
            <div><h3>{routeItem.name}</h3><p>{routeItem.detail}</p></div>
            <strong>{routeItem.fare}<small>{from && to ? `${from} to ${to}` : `${routeItem.origin} to ${routeItem.destination}`} · {routeItem.time}</small></strong>
            <span className="route-result-arrow">View route →</span>
          </Link>)}
          {visibleItems.length === 0 && <div className="card"><h3>{from && to ? 'No matching active routes' : 'No active routes yet'}</h3><p>{from && to ? 'There are no active routes connecting these selected terminals yet.' : 'Published routes will appear here when available.'}</p></div>}
          <div className="card"><h3>Fare is an estimate.</h3><p>Based on the local fare matrix and route distance in Calapan City.</p></div>
        </div>
        <MapPanel routePoints={mapPoints} terminalItems={terminals} label={selectedRoute ? `${selectedRoute.name} route` : 'Calapan City route map'} />
      </div>
      : <div className="card route-search-empty"><span aria-hidden="true">⌖</span><div><h2>Your route will appear here</h2><p>No trip locations are selected yet. Choose your From and To locations, then search to see matching routes and fares.</p></div></div>}
  </main></>;
}

function RouteDetails() {
  const { id } = useParams();
  const [route, setRoute] = useState(null);
  const [terminals, setTerminals] = useState([]);
  const [roadRoute, setRoadRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const popUps = usePopUps();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setRouteLoading(true);
    setRoute(null);
    setTerminals([]);
    setRoadRoute(null);
    setRouteError('');
    Promise.all([getRoutes(), getTerminals()]).then(async ([routeResult, terminalResult]) => {
      const item = (routeResult.data || []).find(row => Number(row.id) === Number(id));
      if (!item) throw new Error('Route not found or no longer active.');
      const availableTerminals = terminalResult.data || [];
      const selectedRoute = {
        ...item,
        code: item.name.slice(0, 2).toUpperCase(),
        fare: `₱${item.fare || '0'}`,
      };
      if (!active) return;
      setRoute(selectedRoute);
      setTerminals(availableTerminals);
      setLoading(false);

      const origin = availableTerminals.find(terminal => terminal.name === item.origin);
      const destination = availableTerminals.find(terminal => terminal.name === item.destination);
      if (!origin || !destination) {
        setRouteError('The origin or destination terminal coordinates are unavailable.');
        setRouteLoading(false);
        return;
      }
      try {
        const result = await getDrivingRoute(
          [Number(origin.lat), Number(origin.lng)],
          [Number(destination.lat), Number(destination.lng)]
        );
        if (active) setRoadRoute(result);
      } catch (exception) {
        if (active) setRouteError(exception.message || 'Could not calculate the road route.');
      } finally {
        if (active) setRouteLoading(false);
      }
    }).catch(exception => {
      if (!active) return;
      const message = exception.message || 'Could not load route details.';
      setError(message);
      popUps.showPopUp({ kind: 'error', title: 'Could not load route details', message });
      setLoading(false);
      setRouteLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  if (loading) return <><Header /><main className="page"><Loading label="Loading route details..." /></main></>;
  if (error || !route) return <><Header /><main className="page"><div className="card"><h1>Route unavailable</h1><p>{error || 'This route is no longer active.'}</p><Link className="button dark" to="/route-search">Back to routes</Link></div></main></>;
  const originTerminal = terminals.find(terminal => terminal.name === route.origin);
  const destinationTerminal = terminals.find(terminal => terminal.name === route.destination);
  const directionsUrl = originTerminal && destinationTerminal
    ? openStreetMapDirectionsUrl([originTerminal.lat, originTerminal.lng], [destinationTerminal.lat, destinationTerminal.lng])
    : '';
  const roadDistance = roadRoute && roadRoute.distance >= 1000
    ? `${(roadRoute.distance / 1000).toFixed(1)} km`
    : roadRoute ? `${Math.round(roadRoute.distance)} m` : '';
  const roadDuration = roadRoute ? `${Math.max(1, Math.round(roadRoute.duration / 60))} min by car` : '';
  return <><Header /><main className="page route-detail-page"><Link className="breadcrumb back-link" to="/route-search">← Back to route search</Link><div className="route-page-heading"><div><span className="eyebrow">ROUTE DETAILS</span><h1>{route.name}</h1><p className="lead">{route.vehicle} · {route.origin} to {route.destination}</p></div><b className={`code code-${route.code[0]}`}>{route.code}</b></div><div className="route-page-grid"><section><MapPanel route={Boolean(roadRoute)} routePoints={roadRoute?.points || []} routeMarkers={[originTerminal, destinationTerminal].filter(Boolean)} terminalItems={[]} label={roadRoute ? `${route.name} road route · ${roadDistance}` : `${route.name} direction`} />{routeLoading && <p className="field-help" role="status">Calculating the road route between terminals...</p>}{routeError && <p className="error" role="alert">{routeError}</p>}{roadRoute && <p className="field-help" role="status">Road route: {roadDistance}, estimated {roadDuration}.</p>}{directionsUrl && <a className="button yellow directions-button" href={directionsUrl} target="_blank" rel="noreferrer">Open turn-by-turn directions</a>}</section><aside className="card route-page-card"><h2>Your route</h2><div className="route-direction"><div><span>ORIGIN</span><strong>{route.origin}</strong></div><i>→</i><div><span>DESTINATION</span><strong>{route.destination}</strong></div></div><div className="route-detail-meta"><span><b>Fare</b>{route.fare}</span><span><b>Schedule</b>{route.schedule || 'Schedule not listed'}</span><span><b>Vehicle</b>{route.vehicle}</span></div><div className="note"><b>Route information</b><p>{route.detail || (roadRoute ? `The highlighted line follows mapped roads between these terminals. The OSRM car estimate is ${roadDistance}, about ${roadDuration}. Actual passenger routes and travel times may differ.` : 'Follow the highlighted route line and check the terminal signs before boarding.')}</p></div></aside></div></main></>;
}

function ReportCreate() {
  const [submitted, setSubmitted] = useState(false);
  const [reference, setReference] = useState('');
  const [reportType, setReportType] = useState(new URLSearchParams(window.location.search).get('type') || 'incident');
  const [error, setError] = useState('');
  const popUps = usePopUps();
  const reportLocationInput = useRef(null);
  const reportLocationRequest = useRef(null);
  const [reportPicking, setReportPicking] = useState(false);
  const [mapHint, setMapHint] = useState('');
  const pickReportLocation = async (latitude, longitude) => {
    setError('');
    setMapHint('');
    reportLocationRequest.current?.abort();
    const request = new AbortController();
    reportLocationRequest.current = request;
    setReportPicking(true);
    try {
      const snapped = await snapToRoad(latitude, longitude, request.signal);
      if (request.signal.aborted) return;
      const lat = snapped.latitude.toFixed(6);
      const lng = snapped.longitude.toFixed(6);
      try {
        const result = await reverseGeocode(snapped.latitude, snapped.longitude, request.signal);
        if (request.signal.aborted) return;
        assertOrientalMindoroAddress(result);
        const found = addressSummary(result);
        const located = `${formatRoadLocation(found, snapped.roadName)} (${lat}, ${lng})`;
        if (reportLocationInput.current) reportLocationInput.current.value = located;
        if (!snapped.roadName) popUps.showPopUp({ kind: 'warning', title: 'This road has no mapped street name', message: 'The selected road has no name in OSRM/OpenStreetMap. The location includes the nearest locality and coordinates; add a landmark if you know one.' });
      } catch (exception) {
        if (exception.name === 'AbortError') return;
        const message = exception.message || 'The road location could not be verified. Choose another point inside Oriental Mindoro.';
        setError(message);
        popUps.showPopUp({ kind: 'warning', title: 'Could not verify the road location', message });
        return;
      }
      return { lat, lng };
    } catch (exception) {
      if (exception.name === 'AbortError') return;
      const message = exception.message || 'Could not read the address from the map. You can still type it below.';
      setError(message);
      popUps.showPopUp({ kind: 'warning', title: 'Could not locate the pin on a road', message });
    } finally {
      if (!request.signal.aborted) setReportPicking(false);
    }
  };
  const config = { complaint: { title: 'Report a complaint', subject: 'Complaint summary', description: 'Explain the service problem, fare issue, or staff concern.' }, incident: { title: 'Report an incident', subject: 'Incident summary', description: 'Describe what happened, who was involved, and any safety concern.' }, assistance: { title: 'Request assistance', subject: 'What help do you need?', description: 'Describe the help you need and where you are located.' }, feedback: { title: 'Rate a service', subject: 'Service review title', description: 'Tell passengers what went well and what can be improved.' } }[reportType] || {};
  const submit = async event => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await submitReport({
        contact_name: form.get('contact_name'),
        contact_email: form.get('contact_email'),
        contact_phone: form.get('contact_phone'),
        report_type: reportType,
        rating: reportType === 'feedback' ? Number(form.get('rating')) : undefined,
        subject: reportType === 'feedback' ? undefined : form.get('subject'),
        description: reportType === 'feedback' ? form.get('feedback_comments') : form.get('description'),
        location_text: form.get('location_text'),
      });
      setReference(result.data.reference_code);
      setSubmitted(true);
    } catch (exception) {
      const message = exception.message || 'Could not submit your report. Please try again.';
      setError(message);
      popUps.showPopUp({ kind: 'error', title: 'Report submission failed', message });
    }
  };
  if (submitted) {
    return <><Header /><main className="page"><section className="card success"><span className="eyebrow">REPORT RECEIVED</span><h1>Your report is on its way.</h1><p>Keep this reference number to check the report status later.</p><strong>{reference}</strong><p><Link className="button outline" to="/reports/track">Track your report</Link></p></section></main></>;
  }
  return <><Header /><main className="page"><div className="title-row"><div><h1>{config.title}</h1><p className="lead">{config.description}</p></div></div>{error && <p className="error" role="alert">{error}</p>}<div className="report-layout"><form className="card form" onSubmit={submit}><div className="tabs" aria-label="Report type">{[['incident', 'Incident'], ['complaint', 'Complaint'], ['assistance', 'Assistance'], ['feedback', 'Feedback']].map(([value, label]) => <button key={value} type="button" className={reportType === value ? 'selected' : ''} onClick={() => setReportType(value)}>{label}</button>)}</div><div className="form-grid"><label>Full name<input name="contact_name" autoComplete="name" required /></label><label>Email<input name="contact_email" type="email" autoComplete="email" /></label><label>Phone<input name="contact_phone" type="tel" autoComplete="tel" /></label>{reportType === 'feedback' ? <><fieldset className="wide rating-field"><legend>Service rating <span aria-hidden="true">*</span></legend><div className="rating-options">{[1, 2, 3, 4, 5].map(value => <label key={value}><input type="radio" name="rating" value={value} required /><span aria-hidden="true">{value} ★</span><small>{value} {value === 1 ? 'star' : 'stars'}</small></label>)}</div></fieldset><label className="wide">Comments (optional)<textarea name="feedback_comments" maxLength="2000" placeholder={config.description} /></label></> : <><label className="wide">{config.subject}<input name="subject" maxLength="200" required /></label><label className="wide">Details<textarea name="description" placeholder={config.description} required /></label></>}<label className="wide">Location<input ref={reportLocationInput} name="location_text" placeholder="Type an address or choose a point on the map" /></label></div><button className="button yellow">Submit {reportType === 'feedback' ? 'rating' : 'report'}</button></form><aside className="card"><h2>Pin the location</h2><p>Map is centered on Oriental Mindoro. First click an area to zoom in, then click the exact road; locations outside the province are rejected.</p><MapPanel label="Choose the report location" interactive onLocationSelect={pickReportLocation} onLocationZoom={() => setMapHint('Zoomed in. Click directly on the road to place the pin.')} /><p className="field-help" role="status">{reportPicking ? 'Finding the nearest road and address...' : mapHint || 'Please verify the pin is close to the actual entrance.'}</p></aside></div></main></>;
}

function TrackReport() {
  const account = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
  const [reference, setReference] = useState('');
  const [report, setReport] = useState(null);
  const [myReports, setMyReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(Boolean(account?.role === 'passenger' && account?.access_token));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const popUps = usePopUps();
  useEffect(() => {
    if (account?.role !== 'passenger' || !account?.access_token) return;
    let active = true;
    getMyReports()
      .then(result => { if (active) setMyReports(result.data || []); })
      .catch(exception => {
        if (active) {
          setError(exception.message);
          popUps.showPopUp({ kind: 'error', title: 'Could not load your reports', message: exception.message });
        }
      })
      .finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; };
  }, []);
  const track = async (event, reportReference = reference) => {
    event?.preventDefault();
    const code = reportReference.trim().toUpperCase();
    setError('');
    setReport(null);
    if (!code) {
      const message = 'Enter the reference number you received after submitting the report.';
      setError(message);
      popUps.showPopUp({ kind: 'warning', title: 'Reference number required', message });
      return;
    }
    setReference(code);
    setLoading(true);
    try {
      const result = await getReport(code);
      setReport(result.data);
    } catch (exception) {
      const message = exception.message.includes('Report not found') ? 'Report not found. Check the reference code.' : 'Could not connect to the report service. Please try again.';
      setError(message);
      popUps.showPopUp({ kind: 'error', title: 'Could not track the report', message });
    } finally {
      setLoading(false);
    }
  };
  return <><Header /><main className="page"><h1>Track a report</h1><p className="lead">{account?.role === 'passenger' ? 'Your submitted reports are listed here. Select a report to see its latest status.' : 'Enter the reference number you received after submitting your report.'}</p>{account?.role === 'passenger' && <section className="my-reports"><h2>My submitted reports</h2>{reportsLoading ? <Loading label="Loading your reports..." /> : myReports.length ? <div className="card admin-list">{myReports.map(item => <article className="admin-record" key={item.id}><div><b>{item.subject || item.report_type}</b><p>{item.reference_code} · {item.report_type} · {item.created_at}</p></div><div><span className="status">{item.status}</span><button className="button outline small" disabled={loading} onClick={event => track(event, item.reference_code)}>View status</button></div></article>)}</div> : <div className="card empty-reports"><h3>No reports submitted yet</h3><p>After you submit a report while logged in, it will appear here so you can track its status.</p><Link className="button yellow small" to="/reports/create">Submit a report</Link></div>}</section>}<h2 className="track-reference-heading">{account?.role === 'passenger' ? 'Track with a reference number' : 'Find your report'}</h2><form className="card track-form" onSubmit={track}><input value={reference} onChange={event => setReference(event.target.value)} placeholder="SL-2026-00001" disabled={loading} /><button className="button yellow" disabled={loading}>{loading ? <><span className="button-spinner" />Checking...</> : 'Track report'}</button></form>{error && <p className="error" role="alert">{error}</p>}{loading && <Loading label="Looking up the report..." />}{report && <div className="report-layout"><div className="card report-detail"><p>{report.report_type} · filed {report.created_at}</p><h2>{report.subject} <span className="status">{report.status}</span></h2><p>{report.description}</p>{report.admin_remarks && <div className="note"><b>Admin remarks</b><br />{report.admin_remarks}</div>}</div><div className="card"><h2>Status history</h2>{report.history?.length ? <ol className="timeline">{report.history.map(item => <li key={`${item.changed_at}-${item.new_status}`} className={item.new_status === report.status ? 'current' : ''}>{item.new_status}<small>{item.changed_at}</small></li>)}</ol> : <p>No status changes have been recorded yet.</p>}</div></div>}</main></>;
}

function Login() {
  const navigate = useNavigate();
  const popUps = usePopUps();
  const [loginError, setLoginError] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  const [registered, setRegistered] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const handleLogin = async event => {
    event.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await login(form.get('identifier'), form.get('password'));
      const account = result.data;
      if (['admin', 'staff'].includes(account.role)) {
        localStorage.removeItem('sakaylokal_user');
        localStorage.setItem('sakaylokal_admin', JSON.stringify(account));
        navigate('/admin');
      } else {
        localStorage.removeItem('sakaylokal_admin');
        localStorage.setItem('sakaylokal_user', JSON.stringify(account));
        navigate('/');
      }
    } catch (exception) {
      const message = exception.message || 'The login request failed. Check Apache and the API URL.';
      setLoginError(message);
      popUps.showPopUp({ kind: 'error', title: 'Log in failed', message });
    } finally {
      setLoginLoading(false);
    }
  };
  const handleRegister = async event => {
    event.preventDefault();
    setRegistrationError('');
    setRegistered('');
    setRegistrationLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await register({ full_name: form.get('full_name'), email: form.get('email'), phone: form.get('phone'), password: form.get('passenger_password') });
      setRegistered('Account created. You can now log in.');
      event.currentTarget.reset();
      popUps.showPopUp({ kind: 'success', title: 'Account created', message: 'You can now log in with your email and password.' });
    } catch (exception) {
      const message = exception.message || 'Registration failed. That email may already be registered.';
      setRegistrationError(message);
      popUps.showPopUp({ kind: 'error', title: 'Registration failed', message });
    } finally {
      setRegistrationLoading(false);
    }
  };
  return <><Header /><main className="auth-page"><section className="auth-intro"><span className="eyebrow">SAKAYLOKAL ACCOUNT</span><h1>Your trips,<br /><span>made easier.</span></h1><p>Log in to save your details, submit reports, and stay connected with transport services across Oriental Mindoro.</p><div className="auth-benefits"><p><b>✓</b> Track your submitted reports</p><p><b>✓</b> Find terminals and routes faster</p><p><b>✓</b> One account for passengers and administrators</p></div></section><section className="auth-panel"><form className="card form auth-card" onSubmit={handleLogin}><div className="auth-heading"><div><span className="eyebrow">WELCOME BACK</span><h2>Log in to SakayLokal</h2></div><span className="auth-icon">↗</span></div><p className="muted">Use your username or email and password.</p><label>Username or email<input name="identifier" placeholder="you@example.com" autoComplete="username" required disabled={loginLoading} /></label><label>Password<input name="password" type="password" placeholder="Enter your password" autoComplete="current-password" required disabled={loginLoading} /></label><button className="button yellow auth-submit" disabled={loginLoading}>{loginLoading ? <><span className="button-spinner" />Signing in...</> : 'Log in'}</button><p className="auth-note">Administrators can use the same login form. Admin accounts are redirected to the admin dashboard automatically.</p></form><form className="card form register-card" onSubmit={handleRegister}><div><span className="eyebrow">NEW HERE?</span><h2>Create a passenger account</h2></div><div className="form-grid"><label className="wide">Full name<input name="full_name" placeholder="Juan Dela Cruz" required disabled={registrationLoading} /></label><label>Email<input name="email" type="email" placeholder="you@email.com" required disabled={registrationLoading} /></label><label>Phone<input name="phone" placeholder="09XX XXX XXXX" disabled={registrationLoading} /></label><label className="wide">Password<input name="passenger_password" type="password" placeholder="At least 6 characters" minLength="6" required disabled={registrationLoading} /></label></div><button className="button outline" disabled={registrationLoading}>{registrationLoading ? <><span className="button-spinner" />Creating...</> : 'Create account'}</button></form></section></main></>;
}

function ProtectedAdmin({ children }) {
  const account = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  return ['admin', 'staff'].includes(account?.role) && account?.access_token ? children : <Navigate to="/login" replace />;
}

function ProtectedAccount({ children }) {
  const account = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
  return account?.role === 'passenger' && account?.access_token ? children : <Navigate to="/login" replace />;
}

function AccountSettings() {
  const [account, setAccount] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const popUps = usePopUps();
  useEffect(() => {
    let active = true;
    getAccount().then(result => { if (active) setAccount(result.data); })
      .catch(exception => { if (active) setError(exception.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!photo) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const savePhoto = async file => {
    if (!file) return;
    setPhoto(file);
    setSaving(true);
    setError('');
    const form = new FormData();
    form.set('full_name', account.full_name || '');
    form.set('email', account.email || '');
    form.set('phone', account.phone || '');
    form.set('notify_advisories', account.notify_advisories ? '1' : '0');
    form.set('notify_weather', account.notify_weather ? '1' : '0');
    form.set('profile_photo', file);
    try {
      const result = await updateAccount(form);
      setAccount(result.data);
      const session = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
      localStorage.setItem('sakaylokal_user', JSON.stringify({ ...session, ...result.data }));
      setPhoto(null);
      popUps.showPopUp({ kind: 'success', title: 'Profile photo saved', message: 'Your photo is uploaded and will remain after refreshing the page.' });
    } catch (exception) {
      setError(exception.message);
      popUps.showPopUp({ kind: 'error', title: 'Could not save your profile photo', message: exception.message });
    } finally {
      setSaving(false);
    }
  };
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    form.set('notify_advisories', account.notify_advisories ? '1' : '0');
    form.set('notify_weather', account.notify_weather ? '1' : '0');
    if (photo) form.set('profile_photo', photo);
    try {
      const result = await updateAccount(form);
      setAccount(result.data);
      const session = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
      localStorage.setItem('sakaylokal_user', JSON.stringify({ ...session, ...result.data }));
      setPhoto(null);
      popUps.showPopUp({ kind: 'success', title: 'Account updated', message: 'Your profile and notification preferences were saved.' });
    } catch (exception) {
      setError(exception.message);
      popUps.showPopUp({ kind: 'error', title: 'Could not save your account', message: exception.message });
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <><Header /><main className="page"><Loading label="Loading account settings..." /></main></>;
  if (!account) return <><Header /><main className="page"><p className="error">{error || 'Could not load your account.'}</p></main></>;
  const avatar = preview || (account.profile_photo ? getPublicAsset(account.profile_photo) : '');
  return <><Header /><main className="page account-page"><div className="title-row"><div><span className="eyebrow">YOUR SAKAYLOKAL ACCOUNT</span><h1>Account settings</h1><p className="lead">Manage your profile and choose which updates you receive by email.</p></div></div>{error && <p className="error" role="alert">{error}</p>}<form className="card form account-form" onSubmit={save} encType="multipart/form-data"><section className="profile-photo-section"><div className="profile-avatar">{avatar ? <img src={avatar} alt="Profile" /> : <span>{account.full_name?.slice(0, 1)?.toUpperCase() || 'U'}</span>}</div><div><h2>Profile photo</h2><p>JPEG, PNG, or WebP, up to 2 MB. Selecting a photo saves it automatically.</p><label className="button outline small photo-picker">{saving && photo ? 'Uploading...' : 'Choose photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={event => savePhoto(event.target.files?.[0] || null)} /></label></div></section><div className="form-grid"><label>Full name<input name="full_name" value={account.full_name || ''} onChange={event => setAccount({ ...account, full_name: event.target.value })} maxLength="150" required /></label><label>Email address<input name="email" type="email" value={account.email || ''} onChange={event => setAccount({ ...account, email: event.target.value })} maxLength="255" required /></label><label className="wide">Phone<input name="phone" value={account.phone || ''} onChange={event => setAccount({ ...account, phone: event.target.value })} maxLength="30" /></label></div><section className="notification-preferences"><h2>Email notifications</h2><p>Subscriptions are optional. Severe-weather checks run every 30 minutes when the scheduled worker is enabled.</p><label className="preference-row"><input type="checkbox" checked={Boolean(Number(account.notify_advisories))} onChange={event => setAccount({ ...account, notify_advisories: event.target.checked ? 1 : 0 })} /><span><b>Public advisories</b><small>Get an email when a new advisory is published.</small></span></label><label className="preference-row"><input type="checkbox" checked={Boolean(Number(account.notify_weather))} onChange={event => setAccount({ ...account, notify_weather: event.target.checked ? 1 : 0 })} /><span><b>Severe weather and heavy-rain alerts</b><small>Alerts are based on Open-Meteo forecasts for Calapan.</small></span></label></section><div className="account-form-actions"><button className="button yellow" disabled={saving}>{saving ? <><span className="button-spinner" />Saving...</> : 'Save settings'}</button></div><p className="field-help">Email delivery requires Gmail SMTP with a Google App Password configured by the site administrator.</p></form></main></>;
}

function AdminReports() {
  const [reports, setReports] = useState([]);
  const [editingReport, setEditingReport] = useState(null);
  const [reportEdits, setReportEdits] = useState({});
  const [savingReport, setSavingReport] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const popUps = usePopUps();
  const load = () => { setLoading(true); adminRequest('reports').then(result => setReports(result.data)).catch(error => { setMessage(error.message); popUps.showPopUp({ kind: 'error', title: 'Could not load reports', message: error.message }); }).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  function startEditing(report) {
    setEditingReport(report.id);
    setReportEdits(current => ({
      ...current,
      [report.id]: {
        status: report.status,
        admin_remarks: report.admin_remarks || '',
      },
    }));
  }
  async function saveReport(report) {
    const edits = reportEdits[report.id];
    if (!edits) return;
    setSavingReport(report.id);
    try {
      await adminRequest('reports', 'POST', {
        id: report.id,
        status: edits.status,
        admin_remarks: edits.admin_remarks,
      });
      setEditingReport(null);
      setReportEdits(current => {
        const next = { ...current };
        delete next[report.id];
        return next;
      });
      await load();
      popUps.showPopUp({ kind: 'success', title: 'Report updated', message: 'The status and admin remarks were saved.' });
    } catch (error) {
      popUps.showPopUp({ kind: 'error', title: 'Could not update the report', message: error.message });
    } finally {
      setSavingReport(null);
    }
  }
  return <AdminLayout><main className="admin-main"><div className="title-row"><h1>Manage reports</h1><span className="admin-pill">{reports.length} reports</span></div>{message && <p className="error" role="alert">{message}</p>}{loading ? <Loading label="Loading reports..." /> : <div className="card admin-list">{reports.map(report => {
    const isEditing = editingReport === report.id;
    const edits = reportEdits[report.id] || { status: report.status, admin_remarks: report.admin_remarks || '' };
    const isSaving = savingReport === report.id;
    return <article className="admin-record" key={report.id}><div><b>{report.reference_code} · {report.subject}</b><p>{report.report_type} · {report.contact_name}</p><p>{report.description}</p>{!isEditing && <p><b>Admin remarks:</b> {report.admin_remarks || 'None'}</p>}</div><div className="report-admin-edit"><label className="sr-only" htmlFor={`report-status-${report.id}`}>Report status</label><select id={`report-status-${report.id}`} value={edits.status} disabled={!isEditing || isSaving} onChange={event => setReportEdits(current => ({ ...current, [report.id]: { ...edits, status: event.target.value } }))}><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>{isEditing && <><label className="sr-only" htmlFor={`report-remarks-${report.id}`}>Admin remarks</label><textarea id={`report-remarks-${report.id}`} value={edits.admin_remarks} disabled={isSaving} placeholder="Admin remarks" onChange={event => setReportEdits(current => ({ ...current, [report.id]: { ...edits, admin_remarks: event.target.value } }))} /><div className="report-edit-actions"><button className="button yellow small" disabled={isSaving} onClick={() => saveReport(report)}>{isSaving ? <><span className="button-spinner" />Saving...</> : 'Save'}</button><button className="button outline small" disabled={isSaving} onClick={() => { setEditingReport(null); setReportEdits(current => { const next = { ...current }; delete next[report.id]; return next; }); }}>Cancel</button></div></>}{!isEditing && <button className="button outline small" onClick={() => startEditing(report)}>Edit</button>}</div></article>;
  })}</div>}</main></AdminLayout>;
}

function AdminRoutes() {
  const blank = { name: '', vehicle: 'jeepney', origin: '', destination: '', origin_terminal_id: '', destination_terminal_id: '', description: '' };
  const [items, setItems] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(blank);
  const [originCity, setOriginCity] = useState('');
  const [originBarangay, setOriginBarangay] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [destinationBarangay, setDestinationBarangay] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const account = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  const popUps = usePopUps();
  const visibleAreas = account?.role === 'staff' && account.assigned_city ? areas.filter(area => area.city === account.assigned_city) : areas;
  const load = (nextPage = page) => { setLoading(true); setMessage(''); adminRequest(`routes?page=${nextPage}&page_size=8`).then(result => { setItems(result.data || []); setMeta(result.meta || null); setPage(nextPage); }).catch(error => { setMessage(error.message); popUps.showPopUp({ kind: 'error', title: 'Could not load routes', message: error.message }); }).finally(() => setLoading(false)); };
  useEffect(() => { load(1); Promise.all([adminRequest('terminals?page_size=50'), getAreas()]).then(([terminalResult, areaResult]) => { setTerminals((terminalResult.data || []).filter(item => Number(item.is_active) === 1)); setAreas(areaResult.data || []); }).catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load route options', message: error.message })); }, []);
  const resetForm = () => { setForm(blank); setOriginCity(''); setOriginBarangay(''); setDestinationCity(''); setDestinationBarangay(''); };
  const save = async event => { event.preventDefault(); try { await adminRequest('routes', 'POST', form); resetForm(); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not save the route', message: error.message }); } };
  const remove = async item => { const action = Number(item.is_active) === 1 ? 'delete' : 'restore'; if (action === 'delete' && !await popUps.confirmAction({ title: 'Archive this route?', message: 'The route will be hidden from public pages but kept in the database.', confirmLabel: 'Yes, archive' })) return; try { await adminRequest('routes', 'POST', { id: item.id, action }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not archive or restore the route', message: error.message }); } };
  const permanentlyDelete = async item => { if (!await popUps.confirmAction({ title: 'Delete this route permanently?', message: 'This cannot be undone. Related fares, schedules, pickup points, and route-terminal links will also be deleted. Reports and ratings will remain without a route link.', confirmLabel: 'Yes, delete permanently', danger: true })) return; try { await adminRequest('routes', 'POST', { id: item.id, action: 'permanent_delete' }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not delete the route', message: error.message }); } };
  const review = async (item, action) => { try { await adminRequest('routes', 'POST', { id: item.id, action }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not update the route status', message: error.message }); } };
  const selectTerminal = (field, nameField, value) => { const terminal = terminals.find(item => String(item.id) === value); setForm({...form, [field]: value, [nameField]: terminal?.name || ''}); };
  const filteredTerminals = (city, barangay) => terminals.filter(terminal => (!city || terminal.city === city) && (!barangay || terminal.area === barangay));
  const editRoute = item => { setForm(item); const originTerminal = terminals.find(terminal => terminal.name === item.origin); const destinationTerminal = terminals.find(terminal => terminal.name === item.destination); setOriginCity(originTerminal?.city || ''); setOriginBarangay(originTerminal?.area || ''); setDestinationCity(destinationTerminal?.city || ''); setDestinationBarangay(destinationTerminal?.area || ''); };
  return <AdminLayout><main className="admin-main"><div className="title-row"><div><h1>Manage routes</h1><p className="lead">New staff submissions stay in draft until the super admin publishes them.</p></div><span className="admin-pill">{meta?.total || items.length} routes</span></div><div className="admin-two-column"><form className="card form" onSubmit={save}><h2>{form.id ? 'Edit route' : 'Add route'}</h2><p className="field-help">Give the route a name passengers will recognize, then pick its vehicle and endpoints below.</p><label>Route name<input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. J2 Poblacion - San Vicente via Public Market" required /></label><label>Vehicle<select value={form.vehicle} onChange={e => setForm({...form, vehicle: e.target.value})}><option value="jeepney">Jeepney</option><option value="bus">Bus</option><option value="tricycle">Tricycle</option><option value="uv_van">UV Van</option></select></label><h3>Origin location</h3><p className="field-help">Step 1 - municipality, then barangay, then the starting terminal.</p><LocationSelectors areas={visibleAreas} city={originCity} barangay={originBarangay} onCityChange={value => { setOriginCity(value); setOriginBarangay(''); setForm({...form, origin_terminal_id: '', origin: ''}); }} onBarangayChange={value => { setOriginBarangay(value); setForm({...form, origin_terminal_id: '', origin: ''}); }} /><label>Origin terminal<select value={form.origin_terminal_id} onChange={e => selectTerminal('origin_terminal_id','origin',e.target.value)} required disabled={!originBarangay}><option value="">Select origin terminal</option>{filteredTerminals(originCity, originBarangay).map(terminal => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}</select></label><h3>Destination location</h3><p className="field-help">Step 2 - municipality, then barangay, then the destination terminal.</p><LocationSelectors areas={visibleAreas} city={destinationCity} barangay={destinationBarangay} onCityChange={value => { setDestinationCity(value); setDestinationBarangay(''); setForm({...form, destination_terminal_id: '', destination: ''}); }}   onBarangayChange={value => { setDestinationBarangay(value); setForm({...form, destination_terminal_id: '', destination: ''}); }} /><label>Destination terminal<select value={form.destination_terminal_id} onChange={e => selectTerminal('destination_terminal_id','destination',e.target.value)} required disabled={!destinationBarangay}><option value="">Select destination terminal</option>{filteredTerminals(destinationCity, destinationBarangay).map(terminal => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}</select></label><label>Description<textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label><button className="button yellow">Save route</button><button type="button" className="button outline" onClick={resetForm}>Clear</button></form>{loading ? <Loading label="Loading routes..." /> : <div><div className="card admin-list">{items.map(item => <div className="admin-record" key={item.id}><div><b>{item.name} {item.workflow_status && <span className="demo-badge">{item.workflow_status}</span>}</b><p>{item.vehicle} · {item.origin} to {item.destination}</p></div><div><button className="button outline small" onClick={() => editRoute(item)}>Edit</button>{item.workflow_status === 'draft' && account?.role === 'staff' && <button className="button outline small" onClick={() => review(item, 'submit')}>Submit</button>}{['submitted','approved'].includes(item.workflow_status) && account?.role === 'admin' && <><button className="button yellow small" onClick={() => review(item, 'approve')}>Publish</button><button className="button outline small" onClick={() => review(item, 'reject')}>Reject</button></>}<button className={`button small ${Number(item.is_active) === 1 ? 'danger' : 'outline'}`} onClick={() => remove(item)}>{Number(item.is_active) === 1 ? 'Archive' : 'Restore'}</button><button className="button danger small" onClick={() => permanentlyDelete(item)}>Delete</button></div></div>)}</div><Pagination meta={meta} onChange={load} /></div>}</div></main></AdminLayout>;
}

function AdminCatalog({ kind, title, fields, workflow = false }) {
  const [items, setItems] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [areas, setAreas] = useState([]);
  const empty = Object.fromEntries(fields.map(field => [field.name, field.default || '']));
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const account = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  const popUps = usePopUps();
  const load = () => { setLoading(true); adminRequest(kind).then(result => setItems(result.data)).catch(error => popUps.showPopUp({ kind: 'error', title: `Could not load ${title.replace('Manage ', '').toLowerCase()}`, message: error.message })).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    if (fields.some(field => field.name === 'route_id')) getRoutes().then(result => setRoutes(result.data || [])).catch(() => {});
    if (fields.some(field => field.name === 'assigned_city')) getAreas().then(result => setAreas(result.data || [])).catch(() => {});
  }, []);
  const save = async event => { event.preventDefault(); try { await adminRequest(kind, 'POST', form); setForm(empty); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not save', message: error.message }); } };
  const review = async (item, action) => { try { await adminRequest(kind, 'POST', { id: item.id, action }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not update the status', message: error.message }); } };
  const remove = async item => { const action = Number(item.is_active) === 1 ? 'delete' : 'restore'; if (!await popUps.confirmAction(action === 'delete' ? { title: 'Archive this record?', message: 'It will be hidden from public pages but kept in the database.', confirmLabel: 'Yes, archive' } : { title: 'Restore this record?', message: 'It will become available to passengers again.', confirmLabel: 'Yes, restore' })) return; try { await adminRequest(kind, 'POST', { id: item.id, action }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not archive or restore this record', message: error.message }); } };
  const permanentlyDelete = async item => { if (!await popUps.confirmAction({ title: 'Delete this advisory permanently?', message: 'This cannot be undone. The advisory will be removed from the database.', confirmLabel: 'Yes, delete permanently', danger: true })) return; try { await adminRequest(kind, 'POST', { id: item.id, action: 'permanent_delete' }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not delete the advisory', message: error.message }); } };
  const routeLabel = routeId => { const route = routes.find(item => String(item.id) === String(routeId)); return route ? `${route.name} · ${route.origin} to ${route.destination}` : `Route #${routeId}`; };
  const fieldLabel = (field, item) => {
    if (field.name === 'route_id') return routeLabel(item[field.name]);
    return field.options?.find(option => option.value === item[field.name])?.label || item[field.name];
  };
  const municipalities = [...new Set(areas.map(area => area.city).filter(Boolean))].sort();
  return <AdminLayout><main className="admin-main"><div className="title-row"><div><h1>{title}</h1><p className="lead">Select existing records so connected data stays consistent.</p></div></div><div className="admin-two-column"><form className="card form" onSubmit={save}><h2>{form.id ? 'Edit' : 'Add'} {title.replace('Manage ', '').toLowerCase()}</h2>{fields.map(field => <label key={field.name}>{field.label}{field.required && <span className="required" title="Required field"> *</span>}{field.name === 'route_id' ? <select value={form[field.name] || ''} onChange={e => setForm({...form, [field.name]: e.target.value})} required={field.required}><option value="">Select a route</option>{routes.map(route => <option key={route.id} value={route.id}>{route.name} · {route.origin} to {route.destination}</option>)}</select> : field.name === 'assigned_city' ? <select value={form[field.name] || ''} onChange={e => setForm({...form, [field.name]: e.target.value})} required={field.required}><option value="">Select municipality/city</option>{municipalities.map(city => <option key={city} value={city}>{city}</option>)}</select> : field.options ? <select value={form[field.name] || field.default || ''} onChange={e => setForm({...form, [field.name]: e.target.value})} required={field.required}><option value="">Select {field.label.toLowerCase()}</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea value={form[field.name] || ''} onChange={e => setForm({...form, [field.name]: e.target.value})} placeholder={field.placeholder} required={field.required} /> : <input type={field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} value={form[field.name] || ''} onChange={e => setForm({...form, [field.name]: e.target.value})} placeholder={field.placeholder} required={field.required} />}{field.help && <small className="field-help">{field.help}</small>}</label>)}<button className="button yellow" disabled={fields.some(field => field.name === 'route_id') && !routes.length}>Save</button>{fields.some(field => field.name === 'route_id') && !routes.length && <p className="error">Add an active route first.</p>}</form>{loading ? <Loading label={`Loading ${title.replace('Manage ', '').toLowerCase()}...`} /> : <div className="card admin-list">{items.map(item => <div className="admin-record" key={item.id}><div><b>{fields.map(field => fieldLabel(field, item)).filter(Boolean).join(' · ') || `#${item.id}`}</b><p>ID: {item.id}{workflow ? ` · Status: ${item.workflow_status || 'draft'}` : ''}</p></div><div>{workflow && item.workflow_status === 'draft' && account?.role === 'staff' && <button className="button outline small" onClick={() => review(item, 'submit')}>Submit</button>}{workflow && ['submitted', 'approved'].includes(item.workflow_status) && account?.role === 'admin' && <><button className="button yellow small" onClick={() => review(item, 'approve')}>Publish</button><button className="button outline small" onClick={() => review(item, 'reject')}>Reject</button></>}<button className="button outline small" onClick={() => setForm(item)}>Edit</button><button className={`button small ${Number(item.is_active) === 1 ? 'danger' : 'outline'}`} onClick={() => remove(item)}>{Number(item.is_active) === 1 ? 'Archive' : 'Restore'}</button>{kind === 'advisories' && <button className="button danger small" onClick={() => permanentlyDelete(item)}>Delete</button>}</div></div>)}</div>}</div></main></AdminLayout>;
}

function AdminLocations() {
  const [areas, setAreas] = useState([]);
  const [city, setCity] = useState('');
  const [barangay, setBarangay] = useState('');
  const [loading, setLoading] = useState(true);
  const popUps = usePopUps();
  useEffect(() => { adminRequest('areas').then(result => setAreas(result.data || [])).catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load the location directory', message: error.message })).finally(() => setLoading(false)); }, []);
  const cities = [...new Set(areas.map(area => area.city))].sort();
  const barangays = areas.filter(area => area.city === city).sort((a, b) => a.name.localeCompare(b.name));
  const selected = barangays.filter(area => !barangay || area.name === barangay);
  return <AdminLayout><main className="admin-main"><div className="title-row"><div><h1>Location directory</h1><p className="lead">Select one municipality/city, then one barangay to inspect its master data.</p></div><span className="admin-pill">{areas.length} locations</span></div><div className="card location-info"><b>SQL-managed location master data</b><p>Official locations come from the SQL seed file. Selecting a location keeps terminal, route, fare, and report data scoped to the same place.</p><div className="location-filter"><label>Municipality or city<select value={city} onChange={event => { setCity(event.target.value); setBarangay(''); }}><option value="">Select municipality/city</option>{cities.map(value => <option key={value}>{value}</option>)}</select></label><label>Barangay<select value={barangay} onChange={event => setBarangay(event.target.value)} disabled={!city}><option value="">Select barangay</option>{barangays.map(area => <option key={area.id}>{area.name}</option>)}</select></label></div></div>{loading ? <Loading label="Loading locations..." /> : !city ? <div className="card selection-empty"><h2>Start with a municipality or city</h2><p>Choose a location above to view its barangays. This prevents the whole Oriental Mindoro directory from appearing in one long page.</p></div> : <section className="card location-group"><div className="section-heading"><div><h2>{city}{barangay ? ` · ${barangay}` : ''}</h2><p>Oriental Mindoro · {selected.length} location{selected.length === 1 ? '' : 's'} selected</p></div><span className="admin-pill">{barangays.length} barangays</span></div><div className="location-tags">{selected.map(area => <span className="chip" key={area.id}>{area.name === 'Municipal Center' ? 'Municipal center' : area.name}</span>)}</div></section>}</main></AdminLayout>;
}

function AdminFares() {
  const blank = { route_id: '', fare_amount: '', notes: '' };
  const [items, setItems] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const popUps = usePopUps();
  const load = () => { setLoading(true); Promise.all([adminRequest('fares'), adminRequest('routes')]).then(([fareResult, routeResult]) => { setItems(fareResult.data || []); setRoutes(routeResult.data || []); }).catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load fares', message: error.message })).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const save = async event => { event.preventDefault(); try { await adminRequest('fares', 'POST', form); setForm(blank); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not save the fare', message: error.message }); } };
  const remove = async id => { if (!await popUps.confirmAction({ title: 'Delete this fare?', message: 'The fare record will be permanently removed from the database.', confirmLabel: 'Yes, delete', danger: true })) return; try { await adminRequest('fares', 'POST', { id, action: 'delete' }); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not delete the fare', message: error.message }); } };
  return <AdminLayout><main className="admin-main"><div className="title-row"><div><h1>Manage fares</h1><p className="lead">Set the passenger fare for an active route.</p></div><span className="admin-pill">{items.length} fares</span></div><div className="admin-two-column"><form className="card form" onSubmit={save}><h2>{form.id ? 'Edit fare' : 'Add fare'}</h2><label>Route<select value={form.route_id} onChange={event => setForm({...form, route_id: event.target.value})} required><option value="">Select a route</option>{routes.map(route => <option key={route.id} value={route.id}>{route.name} · {route.origin} to {route.destination}</option>)}</select></label><label>Fare amount (PHP)<input type="number" min="0" step="0.01" value={form.fare_amount} onChange={event => setForm({...form, fare_amount: event.target.value})} placeholder="15.00" required /><small className="field-help">Regular one-way fare in Philippine pesos.</small></label><label>Notes<textarea value={form.notes} onChange={event => setForm({...form, notes: event.target.value})} placeholder="Optional - e.g. student or senior rate" /><small className="field-help">Optional note shown with the fare.</small></label><button className="button yellow" disabled={!routes.length}>Save fare</button>{!routes.length && <p className="error">Add an active route first before adding a fare.</p>}</form>{loading ? <Loading label="Loading fares..." /> : <div className="card admin-list">{items.map(item => <div className="admin-record" key={item.id}><div><b>{item.route_name || `Route #${item.route_id}`}</b><p>{item.origin_name} to {item.destination_name}</p><p><strong>PHP {Number(item.fare_amount).toFixed(2)}</strong>{item.notes ? ` · ${item.notes}` : ''}</p></div><div><button className="button outline small" onClick={() => setForm({ id: item.id, route_id: String(item.route_id), fare_amount: item.fare_amount, notes: item.notes || '' })}>Edit</button><button className="button danger small" onClick={() => remove(item.id)}>Delete</button></div></div>)}</div>}</div></main></AdminLayout>;
}

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const account = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  return <div className="admin-shell"><aside className={`admin-nav ${mobileNavOpen ? 'is-open' : ''}`}><div className="admin-nav-header"><Link className="brand" to="/"><span className="brand-mark">↗</span><span>SakayLokal</span></Link><button className="mobile-nav-toggle" type="button" aria-label={mobileNavOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(open => !open)}><span /><span /><span /></button></div><div className="admin-nav-links"><p>Overview</p><Link to="/admin">Dashboard</Link><p>Reports</p><Link to="/admin/reports">All reports</Link><p>Transport data</p><Link to="/admin/terminals">Terminals</Link><Link to="/admin/routes">Routes</Link><Link to="/admin/fares">Fares</Link><Link to="/admin/schedules">Schedules</Link><Link to="/admin/advisories">Advisories</Link><Link to="/admin/areas">Areas</Link>{account?.role === 'admin' && <><p>Administration</p><Link to="/admin/users">Staff & users</Link></>}<button className="admin-logout" onClick={() => { localStorage.removeItem('sakaylokal_admin'); localStorage.removeItem('sakaylokal_user'); navigate('/login'); }}>Log out</button></div></aside>{children}</div>;
}

function Admin() {
  const [reports, setReports] = useState([]);
  const popUps = usePopUps();
  useEffect(() => { adminRequest('reports').then(result => setReports(result.data)).catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load the dashboard', message: error.message })); }, []);
  const counts = ['submitted', 'in_progress', 'resolved'];
  return <AdminLayout><main className="admin-main"><div className="title-row"><h1>Dashboard</h1><span className="admin-pill">Admin: admin</span></div><div className="stats"><div className="stat yellow-border"><span>Pending</span><strong>{reports.filter(r => r.status === 'submitted' || r.status === 'under_review').length}</strong></div><div className="stat blue-border"><span>In progress</span><strong>{reports.filter(r => r.status === 'in_progress').length}</strong></div><div className="stat green-border"><span>Resolved</span><strong>{reports.filter(r => r.status === 'resolved').length}</strong></div><div className="stat dark-border"><span>Total reports</span><strong>{reports.length}</strong></div></div><div className="admin-grid"><div className="card"><h2>Reports by type</h2>{['complaint', 'incident', 'assistance', 'feedback'].map(type => <p key={type}>{type} <b className="bar orange" style={{width: `${Math.max(8, reports.filter(r => r.report_type === type).length * 12)}%`}} /> {reports.filter(r => r.report_type === type).length}</p>)}</div><div className="card"><h2>System status</h2><p>Live reports: {reports.length}</p><p>Database-backed admin CRUD is enabled.</p><Link className="button outline small" to="/admin/reports">Manage reports</Link></div></div><div className="card submissions"><h2>Recent submissions</h2>{reports.slice(0, 6).map(row => <p key={row.id}>{row.reference_code} · {row.report_type} · {row.subject} · <b>{row.status}</b><Link className="button outline small" to="/admin/reports">View</Link></p>)}{reports.length === 0 && <p>No reports submitted yet.</p>}</div></main></AdminLayout>;
}

function AdminTerminals() {
  const blank = { area_id: '', name: '', address: '', landmark: '', lat: 13.41172, lng: 121.18024, hours: '5:00 AM - 9:00 PM', contact_no: '' };
  const [items, setItems] = useState([]);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(blank);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const popUps = usePopUps();
  const account = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  const visibleAreas = account?.role === 'staff' && account.assigned_city ? areas.filter(area => area.city === account.assigned_city) : areas;
  const load = () => { setLoading(true); adminRequest('terminals').then(result => setItems(result.data)).catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load terminals', message: error.message })).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    adminRequest('areas')
      .then(result => setAreas(result.data || []))
      .catch(error => popUps.showPopUp({ kind: 'error', title: 'Could not load locations', message: error.message }))
      .finally(() => setAreasLoaded(true));
  }, []);
  useEffect(() => {
    if (!areasLoaded || !pendingLocation) return;
    const areaMatch = findMatchingArea(visibleAreas, pendingLocation.found.city, pendingLocation.found.barangayCandidates);
    const cityMatch = !areaMatch && visibleAreas.find(area => normalizePlace(area.city) === normalizePlace(pendingLocation.found.city));
    setForm(current => String(current.lat) === pendingLocation.lat && String(current.lng) === pendingLocation.lng
      ? { ...current, area_id: areaMatch?.id || '' }
      : current);
    setMessage(areaMatch
      ? `Location selected: ${areaMatch.name}, ${areaMatch.city}. Pin snapped to ${pendingLocation.roadName || 'an unnamed mapped road'}${pendingLocation.distance ? ` (${pendingLocation.distance} m from your click)` : ''}.`
      : cityMatch
        ? `Could not match "${pendingLocation.found.barangay || 'the barangay'}" to a barangay option in ${cityMatch.city}. Click a road inside the correct barangay.`
        : 'Could not match this map location to a municipality/barangay option. Click a road inside a listed barangay.');
  }, [areasLoaded, areas, pendingLocation, account?.role, account?.assigned_city]);
  const resetForm = () => { setForm(blank); setPendingLocation(null); };
  const save = async event => {
    event.preventDefault();
    if (!form.area_id || !selectedArea) {
      setMessage('Could not add terminal: pin a road inside a recognized barangay first. Check the selected location shown above the form.');
      return;
    }
    if (!form.name.trim() || !form.address.trim() || !form.hours.trim()) {
      setMessage('Could not add terminal: enter the terminal name, address, and operating hours.');
      return;
    }
    if (!Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng))) {
      setMessage('Could not add terminal: choose a valid location on the map.');
      return;
    }
    setSaving(true);
    setMessage('Saving terminal...');
    try {
      const result = await adminRequest('terminals', 'POST', {
        ...form,
        area_id: selectedArea.id,
        name: form.name.trim(),
        address: form.address.trim(),
        hours: form.hours.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
      });
      if (!Number(result?.data?.id)) {
        throw new Error('The server did not confirm that the terminal was saved.');
      }
      resetForm();
      setMessage('Terminal added successfully.');
      load();
    } catch (error) {
      setMessage(`Could not save terminal: ${error.message}`);
      popUps.showPopUp({ kind: 'error', title: 'Could not save the terminal', message: error.message });
    } finally {
      setSaving(false);
    }
  };
  const remove = async item => { const action = Number(item.is_active) === 1 ? 'delete' : 'restore'; setMessage(''); try { await adminRequest('terminals', 'POST', { id: item.id, action }); setPendingAction(null); setMessage(action === 'delete' ? 'Terminal archived successfully.' : 'Terminal restored successfully.'); load(); } catch (error) { setPendingAction(null); popUps.showPopUp({ kind: 'error', title: 'Could not archive or restore the terminal', message: error.message }); } };
  const permanentlyDelete = async item => { if (!await popUps.confirmAction({ title: 'Delete this terminal permanently?', message: 'This cannot be undone. Route links will be removed; reports and ratings will remain without a terminal link.', confirmLabel: 'Yes, delete permanently', danger: true })) return; try { await adminRequest('terminals', 'POST', { id: item.id, action: 'permanent_delete' }); setPendingAction(null); setMessage('Terminal deleted permanently.'); load(); } catch (error) { popUps.showPopUp({ kind: 'error', title: 'Could not delete the terminal', message: error.message }); } };
  const editTerminal = item => setForm(item);
  const selectedArea = visibleAreas.find(area => String(area.id) === String(form.area_id));
  const [picking, setPicking] = useState(false);
  const locationRequest = useRef(null);
  const pickLocation = async (latitude, longitude) => {
    setMessage('');
    setPendingLocation(null);
    setForm(current => ({ ...current, area_id: '' }));
    locationRequest.current?.abort();
    const request = new AbortController();
    locationRequest.current = request;
    setPicking(true);
    try {
      const snapped = await snapToRoad(latitude, longitude, request.signal);
      if (request.signal.aborted) return;
      const lat = snapped.latitude.toFixed(6);
      const lng = snapped.longitude.toFixed(6);
      let found;
      try {
        const result = await reverseGeocode(snapped.latitude, snapped.longitude, request.signal);
        if (request.signal.aborted) return;
        assertOrientalMindoroAddress(result);
        found = addressSummary(result);
        setForm(current => ({
          ...current,
          lat,
          lng,
          address: formatRoadLocation(found, snapped.roadName),
          area_id: '',
        }));
        setPendingLocation({ found, lat, lng, roadName: snapped.roadName, distance: snapped.distance });
      } catch (exception) {
        if (exception.name === 'AbortError') return;
        const errorMessage = exception.message || 'The road location could not be verified. Choose another point inside Oriental Mindoro.';
        setMessage(errorMessage);
        return;
      }
      setMessage(areasLoaded ? 'Pin snapped. Matching its barangay...' : 'Pin snapped. Loading locations to match its barangay...');
      return { lat, lng };
    } catch (exception) {
      if (exception.name === 'AbortError') return;
      setMessage(exception.message || 'Could not snap the pin to a mapped road. Try clicking closer to a road.');
    } finally {
      if (!request.signal.aborted) setPicking(false);
    }
  };
  return <AdminLayout>
    <main className="admin-main">
      <div className="title-row">
        <div><h1>Manage terminals</h1><p className="lead">Add terminals and pin their locations to nearby mapped roads.</p></div>
        <span className="admin-pill">{items.length} terminals</span>
      </div>
      {message && <p className="field-help" role="status">{message}</p>}
      <div className="admin-two-column">
        <form className="card form" onSubmit={save} noValidate>
          <h2>{form.id ? 'Edit terminal' : 'Add terminal'}</h2>
          <p className="field-help">Tap a road on the map to automatically set the municipality and barangay. First tap zooms in; tap the road again to place the pin.</p>
          <p className="field-help" role="status">Selected location: {selectedArea ? `${selectedArea.name}, ${selectedArea.city}` : 'Tap a verified road on the map to select a barangay before adding.'}</p>
          <label>Terminal name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} maxLength="150" required /></label>
          <label>Address<input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} maxLength="255" required /></label>
          <label>Landmark<input value={form.landmark || ''} onChange={event => setForm({ ...form, landmark: event.target.value })} maxLength="255" /></label>
          <label>Operating hours<input value={form.hours} onChange={event => setForm({ ...form, hours: event.target.value })} maxLength="100" required /></label>
          <label>Contact number<input type="tel" value={form.contact_no || ''} onChange={event => setForm({ ...form, contact_no: event.target.value })} maxLength="30" /></label>
          <h3>Location coordinates</h3>
          <p className="field-help">Map is centered on Oriental Mindoro. First click an area to zoom in, then click the exact road; locations outside the province are rejected.</p>
          <div className="form-grid">
            <label>Latitude<input type="number" step="any" min="-90" max="90" value={form.lat} onChange={event => { setPendingLocation(null); setForm({ ...form, lat: event.target.value, area_id: '' }); }} required /></label>
            <label>Longitude<input type="number" step="any" min="-180" max="180" value={form.lng} onChange={event => { setPendingLocation(null); setForm({ ...form, lng: event.target.value, area_id: '' }); }} required /></label>
          </div>
          <MapPanel label="Choose the terminal location" interactive focusTerminal={{ lat: form.lat, lng: form.lng, name: form.name }} terminalItems={[]} onLocationSelect={pickLocation} onLocationZoom={() => setMessage('Zoomed in. Click directly on the road to place the pin.')} />
          {picking && <p className="field-help" role="status">Snapping pin to the nearest road and looking up the address...</p>}
          <button className="button yellow" disabled={picking || saving}>{saving ? 'Saving terminal...' : form.id ? 'Save terminal' : 'Add terminal'}</button>
          <button type="button" className="button outline" onClick={resetForm}>Clear</button>
        </form>
        <section>
          {loading ? <Loading label="Loading terminals..." /> : <div className="card admin-list">
            {items.length ? items.map(item => <article className="admin-record" key={item.id}>
              <div>
                <b>{item.name}</b>
                <p>{item.address} · {item.area}, {item.city}</p>
                <p>{item.hours}{item.contact_no ? ` · ${item.contact_no}` : ''}</p>
                <p><span className="demo-badge">{item.workflow_status || (Number(item.is_active) === 1 ? 'published' : 'archived')}</span>{Number(item.is_active) !== 1 && <span className="demo-badge">inactive</span>}</p>
              </div>
              <div>
                <button type="button" className="button outline small" onClick={() => editTerminal(item)}>Edit</button>
                {pendingAction === item.id
                  ? <><button type="button" className="button danger small" onClick={() => remove(item)}>Confirm archive</button><button type="button" className="button outline small" onClick={() => setPendingAction(null)}>Cancel</button></>
                  : <button type="button" className={`button small ${Number(item.is_active) === 1 ? 'danger' : 'outline'}`} onClick={() => Number(item.is_active) === 1 ? setPendingAction(item.id) : remove(item)}>{Number(item.is_active) === 1 ? 'Archive' : 'Restore'}</button>}
                <button type="button" className="button danger small" onClick={() => permanentlyDelete(item)}>Delete</button>
              </div>
            </article>) : <p>No terminals have been added yet.</p>}
          </div>}
        </section>
      </div>
    </main>
  </AdminLayout>;
}

function Footer() {
  return <footer><div className="footer-inner"><Link className="footer-brand" to="/">SakayLokal</Link><p>Terminals, routes, fares and schedules for Calapan City, Oriental Mindoro - plus report tracking for passengers.</p><div><b>Explore</b><Link to="/terminals">Terminals</Link><Link to="/route-search">Routes & Fares</Link><Link to="/reports/track">Track a report</Link></div><div><b>Get help</b><Link to="/reports/create">Report an issue</Link><Link to="/login">Log in or register</Link><a href="mailto:info@sakaylokal.local">info@sakaylokal.local</a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} SakayLokal</span><span>Weather by Open-Meteo</span></div></footer>;
}
function App() {
  return <RouteErrorBoundary><RouteTransition><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/terminals" element={<Terminals />} />
    <Route path="/terminals/:id" element={<TerminalDetails />} />
    <Route path="/route-search" element={<RouteSearch />} />
    <Route path="/routes/:id" element={<RouteDetails />} />
    <Route path="/reports/create" element={<ReportCreate />} />
    <Route path="/reports/track" element={<TrackReport />} />
    <Route path="/login" element={<Login />} />
    <Route path="/account" element={<ProtectedAccount><AccountSettings /></ProtectedAccount>} />
    <Route path="/admin" element={<ProtectedAdmin><Admin /></ProtectedAdmin>} />
    <Route path="/admin/reports" element={<ProtectedAdmin><AdminReports /></ProtectedAdmin>} />
    <Route path="/admin/terminals" element={<ProtectedAdmin><AdminTerminals /></ProtectedAdmin>} />
    <Route path="/admin/routes" element={<ProtectedAdmin><AdminRoutes /></ProtectedAdmin>} />
    <Route path="/admin/fares" element={<ProtectedAdmin><AdminFares /></ProtectedAdmin>} />
    <Route path="/admin/schedules" element={<ProtectedAdmin><AdminCatalog kind="schedules" title="Manage schedules" workflow fields={[{name:'route_id',label:'Route',required:true,help:'Select the route this timetable belongs to.'},{name:'schedule_label',label:'Schedule label',required:true,placeholder:'e.g. Morning / First trip',help:'A short name passengers can recognize.'},{name:'start_time',label:'Start time',required:true,placeholder:'e.g. 5:30 AM',help:'When the first trip departs.'},{name:'end_time',label:'End time',required:true,placeholder:'e.g. 8:00 PM',help:'When the last trip leaves.'},{name:'days_available',label:'Days available',required:true,placeholder:'e.g. Monday to Saturday',help:'Which days this schedule applies.'}]} /></ProtectedAdmin>} />
    <Route path="/admin/advisories" element={<ProtectedAdmin><AdminCatalog kind="advisories" title="Manage advisories" workflow fields={[{name:'title',label:'Advisory title',required:true,placeholder:'e.g. J2 rerouted today',help:'Short headline passengers see first.'},{name:'advisory_type',label:'Type',required:true,default:'advisory',options:[{value:'advisory',label:'Advisory'},{value:'announcement',label:'Announcement'},{value:'alert',label:'Alert'}],help:'What kind of notice is this?'},{name:'recipient_audience',label:'Email recipients',required:true,default:'passengers',options:[{value:'passengers',label:'Passengers'},{value:'staff',label:'Staff'},{value:'both',label:'Passengers and staff'}],help:'Only active, opted-in passenger/staff accounts are included. Admin accounts are never treated as users or sent advisory emails.'},{name:'body',label:'Message',type:'textarea',required:true,placeholder:'What passengers need to know...',help:'Full details shown on the home page.'}]} /></ProtectedAdmin>} />
    <Route path="/admin/areas" element={<ProtectedAdmin><AdminLocations /></ProtectedAdmin>} />
    <Route path="/admin/users" element={<ProtectedAdmin><AdminCatalog kind="users" title="Manage users" fields={[{name:'full_name',label:'Full name',required:true},{name:'email',label:'Username/email',required:true},{name:'role',label:'Role',required:true,default:'staff',options:[{value:'staff',label:'Municipality staff'},{value:'passenger',label:'Passenger'}]},{name:'assigned_city',label:'Assigned municipality/city'},{name:'phone',label:'Phone'},{name:'password',label:'Password',type:'password'}]} /></ProtectedAdmin>} />
  </Routes></RouteTransition></RouteErrorBoundary>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><PopUpsProvider><App /></PopUpsProvider></BrowserRouter>);
