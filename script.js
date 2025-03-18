// script.js

let map, markers = [];
const RANGES = {
    cercanos: 1000,    // 1 km
    medios: 3000,     // 3 km
    lejanos: 5000     // 5 km
};

async function initMap() {
    map = L.map('map').setView([40.4168, -3.7038], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', async e => {
        await analyzeLocation(e.latlng);
    });
}

document.addEventListener('DOMContentLoaded', initMap);

async function geocodeAddress() {
    const address = document.getElementById('address').value;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${address}`);
    const data = await response.json();
    if (data.length > 0) {
        const location = L.latLng(data[0].lat, data[0].lon);
        map.flyTo(location, 15);
        await analyzeLocation(location);
    }
}

async function analyzeLocation(location) {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    const overpassQuery = `
        [out:json];
        node[amenity=hospital](around:${RANGES.lejanos},${location.lat},${location.lng});
        out;
    `;

    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
        const data = await response.json();

        let closest = { distance: Infinity };
        const counts = { cercanos: 0, medios: 0, lejanos: 0 };

        data.elements.forEach(hospital => {
            const hospitalLoc = L.latLng(hospital.lat, hospital.lon);
            const distance = location.distanceTo(hospitalLoc);

            if (distance <= RANGES.cercanos) counts.cercanos++;
            else if (distance <= RANGES.medios) counts.medios++;
            else if (distance <= RANGES.lejanos) counts.lejanos++;

            if (distance < closest.distance) {
                closest = {
                    distance,
                    name: hospital.tags.name || 'Hospital sin nombre',
                    coords: hospitalLoc
                };
            }

            const marker = L.marker(hospitalLoc, {
                icon: L.divIcon({ className: 'hospital-marker', iconSize: [12, 12] })
            }).bindPopup(`${hospital.tags.name}<br>${(distance / 1000).toFixed(2)} km`);
            markers.push(marker.addTo(map));
        });

        const total = counts.cercanos + counts.medios + counts.lejanos;
        let coverageLevel = 'low';

        if (total === 0) {
            coverageLevel = 'low';
        } else {
            const score = (counts.cercanos * 3) + (counts.medios * 2) + counts.lejanos;
            if (score >= 5) coverageLevel = 'good';
            else if (score >= 2) coverageLevel = 'moderate';
        }

        const resultDiv = document.getElementById('analysisResult');
        resultDiv.innerHTML = `
            <h3 style="margin: 5px 0;">Análisis de cobertura:</h3>
            ${total === 0 ?
                '<div class="coverage-low">❌ Sin hospitales cercanos</div>' :
                `<div class="coverage-${coverageLevel}">
                    <strong>Nivel de cobertura:</strong> ${getCoverageLabel(coverageLevel)}
                </div>
                <div style="margin-top: 10px;">
                    <strong>Hospital más cercano:</strong><br>
                    ${closest.name}<br>
                    ${(closest.distance / 1000).toFixed(2)} km
                </div>
                <div style="margin-top: 10px;">
                    <strong>Distribución:</strong><br>
                    • <1 km: ${counts.cercanos}<br>
                    • 1-3 km: ${counts.medios}<br>
                    • 3-5 km: ${counts.lejanos}<br>
                    Total: ${total}
                </div>`
            }
        `;

    } catch (error) {
        console.error('Error:', error);
    }
}

function getCoverageLabel(level) {
    const labels = {
        good: '🟢 Buena cobertura',
        moderate: '🟡 Cobertura moderada',
        low: '🔴 Cobertura insuficiente'
    };
    return labels[level] || 'Desconocida';
}
