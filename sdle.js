var map, infoWindow, geocoder;
var service_bodies = [];
var root = "https://tomato.na-bmlt.org/main_server/";

$(function() {
    $.getJSON(root + "client_interface/jsonp/?switcher=GetServiceBodies&callback=?", function(data) {
        service_bodies = data;
    });
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
        zoom: 8
    });
    infoWindow = new google.maps.InfoWindow;
    geocoder = new google.maps.Geocoder;

    google.maps.event.addListener(map,'click',function(e) {
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
        if (parseInt(data[0]["distance_in_miles"]) < 100) {
            var content = "<b>" + serviceBodyDetails["name"] + "</b>";
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

function handleLocationError(browserHasGeolocation, infoWindow, pos) {
    infoWindow.setPosition(pos);
    infoWindow.setContent(browserHasGeolocation ?
        'Error: The Geolocation service failed.' :
        'Error: Your browser doesn\'t support geolocation.');
    infoWindow.open(map);
}

function getServiceBodyById(id) {
    for (var service_body of service_bodies) {
        if (service_body["id"] === id) return service_body;
    }
}
