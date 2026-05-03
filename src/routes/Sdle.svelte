<script lang="ts">
	import { onMount } from 'svelte';
	import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
	import { Marker } from '@googlemaps/adv-markers-utils';

	let map: google.maps.Map;
	let infoWindow: google.maps.InfoWindow;
	let geocoder: google.maps.Geocoder;
	let mapElement: HTMLElement;
	let criteria: string = '';
	let serviceBodies: ServiceBody[] = [];
	let kml_layers: google.maps.KmlLayer[] = [];
	let map_customs: HTMLElement[] = [];
	let map_objects: (google.maps.marker.AdvancedMarkerElement | google.maps.Polygon | google.maps.Circle)[] = [];
	let distanceUnit: string = 'miles';
	// Google Maps requires circle radius in meters
	const radius_to_miles_ratio = 1609.34; // 1 mile = 1609.34 meters
	const radius_to_km_ratio = 1000; // 1 km = 1000 meters
	const root = 'https://aggregator.bmltenabled.org/main_server/';
	const kml = {
		popdensity: ['us/alabama.kmz', 'us/connecticut.kmz', 'us/florida.kmz', 'us/massachusetts.kmz', 'us/rhode-island.kmz', 'us/tennessee.kmz', 'us/wisconsin.kmz']
	};

	interface Meeting {
		id_bigint: number;
		meeting_name: string;
		latitude: number;
		longitude: number;
		location_street: string;
		location_municipality: string;
		location_province: string;
		service_body_bigint: string;
		distance_in_miles: string;
		distance_in_km: string;
		root_server_uri: string;
	}

	interface ServiceBody {
		id: string;
		name: string;
		url: string;
		helpline: string;
		parent_id: string;
	}

	interface PlaceSelectEvent extends Event {
		placePrediction: {
			toPlace: () => {
				fetchFields: (options: { fields: string[] }) => Promise<void>;
				location: google.maps.LatLng;
				viewport?: google.maps.LatLngBounds;
				formattedAddress: string;
				displayName: string;
				toJSON: () => Record<string, unknown>;
			};
		};
	}

	function formatPhoneNumber(phone: string): string {
		const digits = phone.replace(/\D/g, '');
		const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
		if (d.length === 10) {
			return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
		}
		return phone;
	}

	const initMap = async (map: google.maps.Map) => {
		infoWindow = new google.maps.InfoWindow();
		geocoder = new google.maps.Geocoder();

		document.addEventListener('click', handleInfoWindowClick);

		if (typeof window !== 'undefined') {
			try {
				const autocomplete = new google.maps.places.PlaceAutocompleteElement({});
				autocomplete.id = 'criteriaSearch';

				const locationSearchDiv = document.getElementById('autocomplete-box') as HTMLElement;
				if (!locationSearchDiv) {
					console.error('Cannot find autocomplete-box element');
					return;
				}

				locationSearchDiv.appendChild(autocomplete);
				autocomplete.addEventListener('gmp-select', async (event) => {
					const placeEvent = event as unknown as PlaceSelectEvent;

					try {
						const place = placeEvent.placePrediction.toPlace();
						await place.fetchFields({
							fields: ['displayName', 'formattedAddress', 'location']
						});

						const location = place.location;
						if (location) {
							const latLngLiteral = { lat: location.lat(), lng: location.lng() };
							criteria = place.formattedAddress || place.displayName;
							infoWindow.setContent(`<div><strong>${place.displayName}</strong><br>${place.formattedAddress}</div>`);
							infoWindow.setPosition(location);
							infoWindow.open(map);

							if (place.viewport) {
								map.fitBounds(place.viewport);
							} else {
								map.setCenter(location);
								map.setZoom(17);
							}

							await setMapInfo(latLngLiteral);
						} else {
							console.error('No location data in place object');
						}
					} catch (error) {
						console.error('Error processing place selection:', error);
					}
				});
			} catch (error) {
				console.error('Error setting up autocomplete:', error);
			}
		}

		map.addListener('click', (e: google.maps.MapMouseEvent) => {
			infoWindow.close();
			const latLng = e.latLng;
			if (latLng) {
				setMapInfo({ lat: latLng.lat(), lng: latLng.lng() });
			}
		});

		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					setMapInfo({ lat: position.coords.latitude, lng: position.coords.longitude });
				},
				() => {
					const center = map.getCenter();
					if (center) {
						handleLocationError(true, center);
					}
				}
			);
		} else {
			const center = map.getCenter();
			if (center) {
				handleLocationError(false, center);
			}
		}
	};

	const fetchServiceBodyForCoordinates = async (latitude: number, longitude: number): Promise<Meeting[]> => {
		const response = await fetch(`${root}/client_interface/json/?switcher=GetSearchResults&sort_results_by_distance=1&geo_width=-10&long_val=${longitude}&lat_val=${latitude}`);
		const data: Meeting[] = await response.json();
		return data;
	};

	const getServiceBodyById = (id: string) => {
		return serviceBodies.find((body) => body.id === id);
	};

	const rootServerServiceBodiesCache: Record<string, ServiceBody[]> = {};

	const getRootServerServiceBodies = async (rootServerUri: string): Promise<ServiceBody[]> => {
		if (rootServerServiceBodiesCache[rootServerUri]) return rootServerServiceBodiesCache[rootServerUri];
		const base = rootServerUri.endsWith('/') ? rootServerUri : `${rootServerUri}/`;
		const response = await fetch(`${base}client_interface/json/?switcher=GetServiceBodies`);
		const data: ServiceBody[] = await response.json();
		rootServerServiceBodiesCache[rootServerUri] = data;
		return data;
	};

	const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

	interface BodyIds {
		name: string;
		homeId: string | undefined;
		aggId: string;
	}

	const buildWidgetConfigSection = (homeServer: string, aggServer: string, bodies: BodyIds[]): string => {
		const normalize = (u: string) => (u.endsWith('/') ? u : `${u}/`);
		const home = escapeHtml(normalize(homeServer));
		const agg = escapeHtml(normalize(aggServer));
		const chip = (val: string, label: string) =>
			val
				? `<button type="button" class="copy-chip" data-copy="${val}" title="Click to copy ${label}"><span class="chip-label">${label}</span><span class="chip-value">${val}</span></button>`
				: `<span class="copy-chip copy-chip-empty"><span class="chip-label">${label}</span><span class="chip-value">—</span></span>`;
		const idChip = (id: string, name: string) => chip(id, `Service Body ID — ${escapeHtml(name)}`);
		const homeIdChips = bodies.map((b) => idChip(b.homeId ? escapeHtml(b.homeId) : '', b.name)).join('');
		const aggIdChips = bodies.map((b) => idChip(escapeHtml(b.aggId), b.name)).join('');
		return `
<div class="widget-config">
	<a href="javascript:void(0);" class="widget-config-toggle">Server details ▸</a>
	<div class="widget-config-body" hidden>
		<div class="wc-col">
			<div class="wc-col-title">Home server</div>
			${chip(home, 'Server URL')}
			${homeIdChips}
		</div>
		<div class="wc-col">
			<div class="wc-col-title">Aggregator</div>
			${chip(agg, 'Server URL')}
			${aggIdChips}
		</div>
	</div>
</div>`;
	};

	const setMapInfo = async (pos: { lat: number; lng: number }) => {
		infoWindow.setPosition(new google.maps.LatLng(pos.lat, pos.lng));
		const data = await fetchServiceBodyForCoordinates(pos.lat, pos.lng);
		if (data && data.length > 0) {
			const serviceBodyDetails = getServiceBodyById(data[0]['service_body_bigint']);
			const parentServiceBody = serviceBodyDetails && Number(serviceBodyDetails['parent_id']) > 0 ? getServiceBodyById(serviceBodyDetails['parent_id']) : { name: 'no parent', id: -1 };
			let content: string;
			if (parseInt(data[0].distance_in_miles || '0') < 100 && serviceBodyDetails && parentServiceBody) {
				const rootBodies = await getRootServerServiceBodies(data[0].root_server_uri);
				const rootId = rootBodies.find((b) => b.name === serviceBodyDetails.name)?.id;
				const parentRootId = rootBodies.find((b) => b.name === parentServiceBody.name)?.id;
				const serviceBodyLink = `<b><a href='javascript:window.drawServiceBody(${serviceBodyDetails['id']}, false);'>${serviceBodyDetails.name}</a></b>`;
				const parentServiceBodyLink =
					Number(parentServiceBody.id) > -1 ? ` (<a href='javascript:window.drawServiceBody(${serviceBodyDetails['parent_id']}, true);'>${parentServiceBody.name}</a>)` : '';
				const rawUrl = serviceBodyDetails.url.trim();
				const websiteUrl = rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`;
				const websiteLink = rawUrl ? `<br>Website: <a href='${websiteUrl}' target='_blank'>${rawUrl}</a>` : '';
				const rawHelpline = serviceBodyDetails.helpline.split('|')[0].trim();
				const helplineLink = rawHelpline ? `<br>Helpline: <a href='tel:${formatPhoneNumber(rawHelpline)}' target='_blank'>${formatPhoneNumber(rawHelpline)}</a>` : '';
				const rootServerLink = `<br>Root Server: <a href='${data[0].root_server_uri}' target='_blank'>${data[0].root_server_uri}</a>`;
				const bodies: BodyIds[] = [{ name: serviceBodyDetails.name, homeId: rootId, aggId: serviceBodyDetails['id'] }];
				if (Number(parentServiceBody.id) > -1) {
					bodies.push({ name: parentServiceBody.name, homeId: parentRootId, aggId: String(parentServiceBody.id) });
				}
				const widgetConfig = buildWidgetConfigSection(data[0].root_server_uri, root, bodies);
				content = `${serviceBodyLink}${parentServiceBodyLink}${websiteLink}${helplineLink}${rootServerLink}${widgetConfig}`;
			} else {
				content = '<b>Not covered by the BMLT yet.</b>';
			}
			infoWindow.setContent(content);
			infoWindow.open(map);
			map.setCenter(new google.maps.LatLng(pos.lat, pos.lng));
		}
	};

	const handleInfoWindowClick = (e: Event) => {
		const target = e.target as HTMLElement;
		const toggle = target.closest('.widget-config-toggle') as HTMLElement | null;
		if (toggle) {
			e.preventDefault();
			const body = toggle.parentElement?.querySelector('.widget-config-body') as HTMLElement | null;
			if (body) {
				const isHidden = body.hasAttribute('hidden');
				if (isHidden) {
					body.removeAttribute('hidden');
					toggle.textContent = 'Server details ▾';
				} else {
					body.setAttribute('hidden', '');
					toggle.textContent = 'Server details ▸';
				}
			}
			return;
		}
		const chip = target.closest('.copy-chip') as HTMLElement | null;
		if (chip && chip.dataset.copy) {
			e.preventDefault();
			const value = chip.dataset.copy;
			navigator.clipboard?.writeText(value).then(() => {
				const valueEl = chip.querySelector('.chip-value') as HTMLElement | null;
				if (!valueEl) return;
				const original = valueEl.textContent ?? '';
				valueEl.textContent = 'copied!';
				chip.classList.add('copied');
				setTimeout(() => {
					valueEl.textContent = original;
					chip.classList.remove('copied');
				}, 1200);
			});
		}
	};

	const handleLocationError = (browserHasGeolocation: boolean, pos: google.maps.LatLng) => {
		infoWindow.setPosition(pos);
		infoWindow.setContent(browserHasGeolocation ? 'Error: The Geolocation service failed.' : "Error: Your browser doesn't support geolocation.");
		infoWindow.open(map);
	};

	const search = () => {
		geocoder.geocode({ address: criteria }, (results, status) => {
			if (status === 'OK' && results) {
				const location = results[0].geometry?.location;
				if (location) {
					setMapInfo({
						lat: location.lat(),
						lng: location.lng()
					});
				}
			} else {
				alert("Couldn't find address.");
			}
		});
	};

	const clearKmlLayers = () => {
		clearLegend('population_legend');
		while (kml_layers.length > 0) {
			kml_layers[0].setMap(null);
			kml_layers.splice(0, 1);
		}
	};

	const clearLegend = (legendId: string) => {
		const legend = document.getElementById(legendId);
		if (legend) {
			legend.remove();
		}
	};

	const clearAllMapObjects = () => {
		map_objects.forEach((mapObject) => {
			if ('setMap' in mapObject) {
				mapObject.setMap(null);
			}
			if ('map' in mapObject && mapObject.map !== undefined) {
				mapObject.map = null;
			}
		});
		map_objects = [];

		clearKmlLayers();
		infoWindow.close();
		criteria = '';
	};

	const addToMapKmlCollection = (kmlLayer: google.maps.KmlLayer) => {
		kml_layers.push(kmlLayer);
	};

	const addToMapCustomsCollection = (obj: HTMLElement) => {
		map_customs.push(obj);
	};

	const addToMapObjectCollection = (obj: google.maps.marker.AdvancedMarkerElement | google.maps.Polygon | google.maps.Circle) => {
		map_objects.push(obj);
	};

	const getDrawOption = (): string => {
		const radios = Array.from(document.getElementsByName('draw-options-radio')).filter((element): element is HTMLInputElement => element instanceof HTMLInputElement);
		const checkedRadio = radios.find((radio) => radio.checked);
		return checkedRadio ? checkedRadio.value : 'markers';
	};

	const getMeetingsForServiceBody = async (id: number, recurse: boolean): Promise<Meeting[]> => {
		let url = `${root}/client_interface/json/?switcher=GetSearchResults&services[]=${id}&data_field_key=latitude,longitude`;
		if (getDrawOption() === 'markers') {
			url += ',meeting_name,location_street,location_province,location_municipality,id_bigint';
		}

		if (recurse) url += '&recursive=1';
		const response = await fetch(url);
		return await response.json();
	};

	const drawServiceBody = async (id: number, recurse: boolean) => {
		const drawOption = getDrawOption();
		const service_bodies_coords: google.maps.LatLng[] = [];
		const bounds = new google.maps.LatLngBounds();
		const data = await getMeetingsForServiceBody(id, recurse);

		if (drawOption === 'polygon') {
			for (const meeting of data) {
				const LatLng = new google.maps.LatLng(meeting.latitude, meeting.longitude);
				service_bodies_coords.push(LatLng);
				bounds.extend(LatLng);
			}

			const centerPt = bounds.getCenter();
			service_bodies_coords.sort((a, b) => {
				const bearA = google.maps.geometry.spherical.computeHeading(centerPt, a);
				const bearB = google.maps.geometry.spherical.computeHeading(centerPt, b);
				return bearA - bearB;
			});

			// Construct the polygon.
			const serviceBodyPolygon = new google.maps.Polygon({
				paths: service_bodies_coords,
				strokeColor: '#FF0000',
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: '#FF0000',
				fillOpacity: 0.1
			});

			addToMapObjectCollection(serviceBodyPolygon);
			serviceBodyPolygon.setMap(map);
		} else if (drawOption === 'circles') {
			for (const meeting of data) {
				const LatLng = new google.maps.LatLng(meeting.latitude, meeting.longitude);
				const blankMarkerImage = document.createElement('img');
				blankMarkerImage.src = 'images/blank.png';

				const marker = new Marker({
					position: LatLng,
					map: map,
					content: blankMarkerImage
				});

				addToMapObjectCollection(marker);

				const circle = new google.maps.Circle({
					map: map,
					radius: parseFloat((document.getElementById('willingness') as HTMLInputElement).value) * (distanceUnit === 'miles' ? radius_to_miles_ratio : radius_to_km_ratio),
					fillColor: 'blue',
					strokeWeight: 0.5,
					fillOpacity: 0.05,
					center: LatLng
				});
				addToMapObjectCollection(circle);
			}
		} else if (drawOption === 'markers') {
			for (const meeting of data) {
				const position = new google.maps.LatLng(meeting.latitude, meeting.longitude);

				// Check for nearby meetings within 100 meters
				const nearbyLocations = data.filter((otherMeeting: Meeting) => {
					const otherPosition = new google.maps.LatLng(otherMeeting.latitude, otherMeeting.longitude);
					const distance = google.maps.geometry.spherical.computeDistanceBetween(position, otherPosition);
					return distance < 100;
				});

				const naMarkerImage = document.createElement('img');
				naMarkerImage.src = 'images/NAMarkerR.png';
				if (nearbyLocations.length > 1) {
					naMarkerImage.src = 'images/NAMarkerB.png';
				}
				const marker = new Marker({
					position: new google.maps.LatLng(meeting.latitude, meeting.longitude),
					map: map,
					title: meeting.id_bigint.toString(),
					gmpClickable: true,
					content: naMarkerImage
				});

				addToMapObjectCollection(marker);

				const message = document.createElement('div');
				message.classList.add('meeting');
				message.innerHTML = `
    <div class="meeting-marker">
        <div class="close-button">&times;</div>
        <b>${meeting.meeting_name} (ID: ${meeting.id_bigint})</b>
        ${meeting.location_street ? `<br/>${meeting.location_street}` : ''}
        ${meeting.location_municipality || meeting.location_province ? `<br/>${[meeting.location_municipality, meeting.location_province].filter(Boolean).join(', ')}` : ''}
    </div>`;
				marker.addListener('click', () => {
					toggleMeetingMarker(marker, message, naMarkerImage);
				});
			}
		}
	};

	const toggleMeetingMarker = (markerView: google.maps.marker.AdvancedMarkerElement, message: HTMLDivElement, naMarkerImage: HTMLImageElement): void => {
		const isMessageContent = markerView.content === message;
		markerView.content = isMessageContent ? naMarkerImage : message;
		markerView.zIndex = isMessageContent ? null : 1;
	};

	const handlePopulationDensityToggle = () => {
		clearKmlLayers();
		const checkbox = document.getElementById('data-layers-popdensity-enabled') as HTMLInputElement;
		if (checkbox && checkbox.checked) {
			for (let l = 0; l < kml.popdensity.length; l++) {
				const kmlLayer = new google.maps.KmlLayer({
					url: window.location.href + 'layers/popdensity/' + kml.popdensity[l] + '?v=' + Date.now().toString(),
					map: map,
					preserveViewport: true
				});

				addToMapKmlCollection(kmlLayer);
			}

			const legend = document.createElement('div');
			legend.id = 'population_legend';
			legend.className = 'legend';
			const content = [];
			content.push('<b>Population density</b><br>/ sq mi.');
			content.push('<p><div class="color color1"></div>&nbsp;&nbsp;>&nbsp;&nbsp;1,000</p>');
			content.push('<p><div class="color color2"></div>&nbsp;&nbsp;250-999</p>');
			content.push('<p><div class="color color4"></div>&nbsp;&nbsp;<&nbsp;&nbsp;250</p>');

			legend.innerHTML = content.join('');
			map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(legend);

			addToMapCustomsCollection(legend);
		}
	};

	if (typeof window !== 'undefined') {
		window.drawServiceBody = drawServiceBody;
	}

	onMount(async function () {
		// Fetch service bodies data
		const response = await fetch(`${root}/client_interface/json/?switcher=GetServiceBodies`);
		serviceBodies = await response.json();

		const thing = 'QUl6YVN5QlZFUGFxQ0RSQWkzbDFqbWY1eGRXMnJDX3kwWE9PcGRN';
		setOptions({
			key: window.atob(thing),
			v: 'weekly'
		});

		const [{ Map }] = await Promise.all([importLibrary('maps'), importLibrary('places'), importLibrary('marker'), importLibrary('geocoding'), importLibrary('geometry')]);

		map = new Map(mapElement, {
			center: { lat: -34.397, lng: 150.644 },
			zoom: 8,
			draggableCursor: 'crosshair',
			mapId: 'sdle'
		});

		await initMap(map);

		const checkbox = document.getElementById('data-layers-popdensity-enabled');
		if (checkbox) {
			checkbox.addEventListener('click', handlePopulationDensityToggle);
		}
	});
</script>

<div id="tallyBannerContainer">
	<a href="https://github.com/bmlt-enabled/sdle/issues" target="blank">
		<img id="tallyBannerImage" src="images/banner.png" alt="Banner" />
	</a>
</div>
<div id="search">
	<div id="autocomplete-box"></div>
	<span id="criteria-box">
		<input id="criteria-button" type="button" value="search" onclick={search} />
		<input id="reset-button" type="button" value="reset" onclick={clearAllMapObjects} />
	</span>
	<span id="draw-options">
		<input type="radio" name="draw-options-radio" value="markers" checked /> Markers
		<input type="radio" name="draw-options-radio" value="polygon" /> Polygon
		<input type="radio" name="draw-options-radio" value="circles" /> Circles / Willingness:
	</span>
	<span id="willingness-distance">
		<input id="willingness" type="text" value="30" size="3" />
		<select id="distance-unit" bind:value={distanceUnit}>
			<option value="miles">miles</option>
			<option value="km">km</option>
		</select>
		<span id="data-layers-container">
			/ Data Layers:
			<span id="data-layers-popdensity">
				<input id="data-layers-popdensity-enabled" type="checkbox" value="false" /> Pop. Density
			</span>
		</span>
	</span>
</div>
<div class="map-container" bind:this={mapElement}></div>

<style>
	:global(.widget-config) {
		margin-top: 8px;
		padding-top: 6px;
		border-top: 1px solid #e5e5e5;
		font-size: 12px;
	}
	:global(.widget-config-toggle) {
		display: inline-block;
		color: #1a73e8;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
	}
	:global(.widget-config-toggle:hover) {
		text-decoration: underline;
	}
	:global(.widget-config-body) {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
		margin-top: 6px;
	}
	:global(.widget-config-body[hidden]) {
		display: none;
	}
	:global(.wc-col-title) {
		font-weight: 600;
		font-size: 11px;
		text-transform: uppercase;
		color: #555;
		margin-bottom: 4px;
	}
	:global(.copy-chip) {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		margin-bottom: 4px;
		padding: 4px 6px;
		background: #f5f5f5;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: inherit;
		font-size: 11px;
		color: #222;
		text-align: left;
		cursor: pointer;
	}
	:global(.copy-chip:hover) {
		background: #ececec;
	}
	:global(.copy-chip.copied) {
		background: #d6f3dc;
		border-color: #8ed6a2;
	}
	:global(.copy-chip-empty) {
		cursor: default;
		opacity: 0.6;
	}
	:global(.copy-chip .chip-label) {
		font-size: 10px;
		font-weight: 600;
		color: #555;
	}
	:global(.copy-chip .chip-value) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		word-break: break-all;
	}
</style>
