<script lang="ts">
	import { onMount } from 'svelte';
	import { Loader } from '@googlemaps/js-api-loader';
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

	const initMap = async (map: google.maps.Map) => {
		infoWindow = new google.maps.InfoWindow();
		geocoder = new google.maps.Geocoder();

		if (typeof window !== 'undefined') {
			const autocomplete = new google.maps.places.Autocomplete(document.getElementById('criteria') as HTMLInputElement, { types: ['geocode'] });
			autocomplete.bindTo('bounds', map);
			autocomplete.addListener('place_changed', () => {
				const place = autocomplete.getPlace();
				if (!place.geometry) return;
				const location = place.geometry.location;
				if (location) {
					setMapInfo({ lat: location.lat(), lng: location.lng() });
					infoWindow.setContent(`<div><strong>${place.name}</strong><br>`);
					infoWindow.open(map);
				}
			});
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

	const setMapInfo = async (pos: { lat: number; lng: number }) => {
		infoWindow.setPosition(new google.maps.LatLng(pos.lat, pos.lng));
		const data = await fetchServiceBodyForCoordinates(pos.lat, pos.lng);
		if (data && data.length > 0) {
			const serviceBodyDetails = getServiceBodyById(data[0]['service_body_bigint']);
			const parentServiceBody = serviceBodyDetails && Number(serviceBodyDetails['parent_id']) > 0 ? getServiceBodyById(serviceBodyDetails['parent_id']) : { name: 'no parent', id: -1 };
			let content = '';
			if (parseInt(data[0].distance_in_miles || '0') < 100 && serviceBodyDetails && parentServiceBody) {
				const serviceBodyLink = `<b><a href='javascript:window.drawServiceBody(${serviceBodyDetails['id']}, false);'>${serviceBodyDetails.name}</a></b>`;
				const parentServiceBodyLink =
					Number(parentServiceBody.id) > -1 ? ` (<a href='javascript:window.drawServiceBody(${serviceBodyDetails['parent_id']}, true);'>${parentServiceBody.name}</a>)` : '';
				const websiteLink = `<br>Website: <a href='${serviceBodyDetails.url}' target='_blank'>${serviceBodyDetails.url}</a>`;
				const helplineLink = `<br>Helpline: <a href='tel:${serviceBodyDetails.helpline.split('|')[0]}' target='_blank'>${serviceBodyDetails.helpline.split('|')[0]}</a>`;
				const rootServerLink = `<br>Root Server: <a href='${data[0].root_server_uri}' target='_blank'>${data[0].root_server_uri}</a>`;
				content = `${serviceBodyLink}${parentServiceBodyLink}${websiteLink}${helplineLink}${rootServerLink}`;
			} else {
				content = '<b>Not covered by the BMLT yet.</b>';
			}
			infoWindow.setContent(content);
			infoWindow.open(map);
			map.setCenter(new google.maps.LatLng(pos.lat, pos.lng));
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
		const thing = 'QUl6YVN5QlZFUGFxQ0RSQWkzbDFqbWY1eGRXMnJDX3kwWE9PcGRN';
		const loader = new Loader({
			apiKey: window.atob(thing),
			version: 'beta',
			libraries: ['places', 'marker', 'geocoding', 'geometry']
		});

		const { Map } = await loader.importLibrary('maps');
		await google.maps.importLibrary('places');
		await google.maps.importLibrary('marker');

		map = new Map(mapElement, {
			center: { lat: -34.397, lng: 150.644 },
			zoom: 8,
			draggableCursor: 'crosshair',
			mapId: 'sdle'
		});

		await initMap(map);

		// Fetch service bodies data
		const response = await fetch(`${root}/client_interface/json/?switcher=GetServiceBodies`);
		serviceBodies = await response.json();

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
	<span id="criteria-box">
		<input type="text" id="criteria" name="criteria" bind:value={criteria} size="20" />
		<input id="criteria-button" type="button" value="search" on:click={search} />
		<input id="reset-button" type="button" value="reset" on:click={clearAllMapObjects} />
	</span>
	<span id="draw-options">
		<input type="radio" name="draw-options-radio" value="markers" checked /> Markers
		<input type="radio" name="draw-options-radio" value="polygon" /> Polygon
		<input type="radio" name="draw-options-radio" value="circles" /> Circles
	</span>
	<span id="willingness-distance">
		/ Willingness:
		<input id="willingness" type="text" value="30" size="3" />
		<select id="distance-unit" bind:value={distanceUnit}>
			<option value="miles">miles</option>
			<option value="km">km</option>
		</select>
	</span>
	/ Data Layers:
	<span id="data-layers-popdensity">
		<input id="data-layers-popdensity-enabled" type="checkbox" value="false" /> Pop. Density
	</span>
</div>
<div class="map-container" bind:this={mapElement} />

<style>
</style>
