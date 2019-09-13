var map, infoWindow, geocoder;
var service_bodies = [];
var root = "https://tomato.na-bmlt.org/main_server/";
var radius_to_miles_ratio = 1609.3;
var map_objects = [];
var map_customs = [];
var kml_layers = [];
var self = this;
var kml = {
    popdensity: [
        'us/alabama.kmz',
        'us/connecticut.kmz',
        'us/florida.kmz',
        'us/massachusetts.kmz',
        'us/rhode-island.kmz',
        'us/tennessee.kmz',
        'us/wisconsin.kmz'
    ]
};

$(function() {
    $.getJSON(root + "client_interface/jsonp/?switcher=GetServiceBodies&callback=?", function(data) {
        service_bodies = data;
    });
});

$('#data-layers-popdensity-enabled').click(function() {
    clearKmlLayers();
    if ($('#data-layers-popdensity-enabled').is(":checked")) {
        for (var l = 0; l < self.kml.popdensity.length; l++) {
            kmlLayer = new google.maps.KmlLayer({
                url: window.location.href + 'layers/popdensity/' + self.kml.popdensity[l] + '?v=' + Date.now().toString(),
                map: map,
                preserveViewport: true,
            });

            addToMapKmlCollection(kmlLayer);
        }

        var legend = document.createElement('div');
        legend.id = 'population_legend';
        legend.className = 'legend';
        var content = [];
        content.push('<b>Population density</b><br>/ sq mi.');
        content.push('<p><div class="color color1"></div>&nbsp;&nbsp;>&nbsp;&nbsp;1,000</p>');
        content.push('<p><div class="color color2"></div>&nbsp;&nbsp;250-999</p>');
        content.push('<p><div class="color color4"></div>&nbsp;&nbsp;<&nbsp;&nbsp;250</p>');

        legend.innerHTML = content.join('');
        legend.index = 1;
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(legend);


        addToMapCustomsCollection(legend);
    }
});

function getServiceBodyForCoordinates(latitude, longitude, callback) {
    $.getJSON(root + "/client_interface/jsonp/?switcher=GetSearchResults&sort_results_by_distance=1&geo_width=-10&long_val=" + longitude + "&lat_val=" + latitude + "&callback=?", function (data) {
        callback(data);
    });

    document.getElementById("criteria").addEventListener("keydown", function (e) {
        if (e.keyCode === 13) {
            search();
        }
    });
}

function getMeetingsForServiceBody(id, recurse, callback) {
    var url = "/client_interface/jsonp/?switcher=GetSearchResults&services[]=" + id + "&data_field_key=latitude,longitude";
    if (getDrawOption() === "markers") {
        url += ',meeting_name,location_street,location_province,location_municipality,id_bigint';
    }

    if (recurse) url += "&recursive=1";
    $.getJSON(root + url + "&callback=?", function (data) {
        callback(data);
    });
}

function search() {
    geocoder.geocode({'address': $("#criteria").val() }, function(results, status) {
        if (status === "OK") {
            setMapInfo(pos = {
                lat: results[0].geometry.location.lat(),
                lng: results[0].geometry.location.lng()
            });
        } else {
            alert("Couldn't find address.");
        }
    });
}

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: -34.397, lng: 150.644},
        zoom: 8,
        draggableCursor: 'crosshair'
    });
    infoWindow = new google.maps.InfoWindow;
    geocoder = new google.maps.Geocoder;

    google.maps.event.addDomListener(map,'click',function(e) {
        infoWindow.close(map);
        setMapInfo({
            lat: e.latLng.lat(),
            lng: e.latLng.lng()
        });
    });

    // Try HTML5 geolocation.
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            setMapInfo({
                lat: position.coords.latitude,
                lng: position.coords.longitude
            });
        }, function() {
            handleLocationError(true, infoWindow, map.getCenter());
        });
    } else {
        // Browser doesn't support Geolocation
        handleLocationError(false, infoWindow, map.getCenter());
    }
}

function setMapInfo(pos) {
    infoWindow.setPosition(pos);
    getServiceBodyForCoordinates(pos.lat, pos.lng, function(data) {
        var serviceBodyDetails = getServiceBodyById(data[0]["service_body_bigint"]);
        var parentServiceBody = serviceBodyDetails['parent_id'] > 0 ? getServiceBodyById(serviceBodyDetails['parent_id']) : { name: "no parent", id: -1 }
        if (parseInt(data[0]["distance_in_miles"]) < 100) {
            var content = "<b><a href='javascript:drawServiceBody(" + serviceBodyDetails['id'] + ", false);'>" + serviceBodyDetails["name"] + "</a></b>" + (parentServiceBody['id'] > -1 ? " (<a href='javascript:drawServiceBody(" + serviceBodyDetails['parent_id'] + ", true);'>" + parentServiceBody['name'] + "</a>)" : "");
            content += "<br>Website: <a href='" + serviceBodyDetails["url"] + "' target='_blank'>" + serviceBodyDetails["url"] + "</a>";
            content += "<br>Helpline: <a href='tel:" + serviceBodyDetails["helpline"].split("|")[0] + "' target='_blank'>" + serviceBodyDetails["helpline"].split("|")[0] + "</a>";
            content += "<br>Root Server: <a href='" + data[0]["root_server_uri"] + "' target='_blank'>" + data[0]["root_server_uri"] + "</a>";
        } else {
            content = "<b>Not covered by the BMLT yet.</b>";
        }
        infoWindow.setContent(content);
        infoWindow.open(map);
        map.setCenter(pos);
    });
}

function getDrawOption() {
    var radios = document.getElementsByName('draw-options-radio');
    for (var i = 0, length = radios.length; i < length; i++) {
        if (radios[i].checked) {
            return radios[i].value;
        }
    }
}

function drawServiceBody(id, recurse) {
    var drawOption = getDrawOption();
    var service_bodies_coords = [];
    var bounds = new google.maps.LatLngBounds();
    getMeetingsForServiceBody(id, recurse, function (data) {
        if (drawOption === "polygon") {
            for (var i = 0; i < data.length; i++) {
                var meeting = data[i];
                var LatLng = new google.maps.LatLng(meeting.latitude, meeting.longitude);
                service_bodies_coords.push(LatLng);
                bounds.extend(LatLng);
            }

            var centerPt = bounds.getCenter();
            service_bodies_coords.sort(function (a, b) {
                var bearA = google.maps.geometry.spherical.computeHeading(centerPt, a);
                var bearB = google.maps.geometry.spherical.computeHeading(centerPt, b);
                return (bearA - bearB);
            });

            // Construct the polygon.
            var serviceBodyPolygon = new google.maps.Polygon({
                paths: service_bodies_coords,
                strokeColor: '#FF0000',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#FF0000',
                fillOpacity: 0.5
            });

            addToMapObjectCollection(serviceBodyPolygon);
            serviceBodyPolygon.setMap(map);
        } else if (drawOption === "circles") {
            for (var j = 0; j < data.length; j++) {
                var meeting = data[j];

                var marker = new google.maps.Marker({
                    map: map,
                    position: new google.maps.LatLng(meeting.latitude, meeting.longitude),
                    icon: {
                        url: "blank.png"
                    }
                });

                addToMapObjectCollection(marker);

                var circle = new google.maps.Circle({
                    map: map,
                    radius: parseFloat($("#willingness").val()) * radius_to_miles_ratio,
                    fillColor: 'blue',
                    strokeWeight: 0.5,
                    fillOpacity: 0.05,
                });
                circle.bindTo('center', marker, 'position');
                addToMapObjectCollection(circle);
            }
        } else if (drawOption === "markers") {
            var marker_url = "images/red_dot.png";
            for (var j = 0; j < data.length; j++) {
                var meeting = data[j];

                var marker = new google.maps.Marker({
                    map: map,
                    position: new google.maps.LatLng(meeting.latitude, meeting.longitude),
                    icon: {
                        url: marker_url
                    }
                });

                addToMapObjectCollection(marker);

                var message = "<b>" + meeting.meeting_name + " (ID: " + meeting.id_bigint + ")" + "</b>";
                message += "<br/>" + meeting.location_street;
                message += "<br/>" + meeting.location_municipality + ", " + meeting.location_province;
                marker.setTitle(meeting.id_bigint);
                addMeetingInfoWindow(marker, message);
            }


        }
    });
}

function addToMapKmlCollection(kmlLayer) {
    kml_layers.push(kmlLayer);
}

function addToMapCustomsCollection(obj) {
    map_customs.push(obj);
}

function addToMapObjectCollection(obj) {
    map_objects.push(obj);
}

function clearLegend(id) {
    var element = document.getElementById(id);
    if (element !== null) {
        element.parentNode.removeChild(element);
        map_customs.splice(0, 1);
    }
}

function clearKmlLayers() {
    clearLegend("population_legend");
    while (kml_layers.length > 0) {
        kml_layers[0].setMap(null);
        kml_layers.splice(0, 1);
    }
}

function clearAllMapObjects() {
    while (map_objects.length > 0) {
        map_objects[0].setMap(null);
        map_objects.splice(0, 1);
    }

    clearKmlLayers();
    infoWindow.close();
    document.getElementById('criteria').value = '';
}

function addMeetingInfoWindow(marker, message) {
    var meetingInfoWindow = new google.maps.InfoWindow({
        content: message
    });
    google.maps.event.addDomListener(marker,'click', function() {
        meetingInfoWindow.open (map, marker);
    });
}

function handleLocationError(browserHasGeolocation, infoWindow, pos) {
    infoWindow.setPosition(pos);
    infoWindow.setContent(browserHasGeolocation ?
        'Error: The Geolocation service failed.' :
        'Error: Your browser doesn\'t support geolocation.');
    infoWindow.open(map);
}

function getServiceBodyById(id) {
    for (var i = 0; i < service_bodies.length; i++) {
        if (service_bodies[i]["id"] === id) return service_bodies[i];
    }
}
