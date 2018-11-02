var map, infoWindow;
var service_bodies = [];
var root = "https://tomato.na-bmlt.org/main_server/";

$(function() {
    $.getJSON(root + "client_interface/jsonp/?switcher=GetServiceBodies&callback=?", function(data) {
        service_bodies = data;
    });
});

function getServiceBodyForCoordinates(latitude, longitude, callback) {
    $.getJSON(root + "/client_interface/jsonp/?switcher=GetSearchResults&geo_width=-10&long_val=" + longitude + "&lat_val=" + latitude + "&callback=?", function (data) {
        callback(data);
    });
}

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: -34.397, lng: 150.644},
        zoom: 6
    });
    infoWindow = new google.maps.InfoWindow;

    // Try HTML5 geolocation.
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            var pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            infoWindow.setPosition(pos);
            getServiceBodyForCoordinates(pos.lat, pos.lng, function(data) {
                var serviceBodyDetails = getServiceBodyById(data[0]["service_body_bigint"]);
                var content = "<b>" + serviceBodyDetails["name"] + "</b>";
                content += "<br>Website: <a href='" + serviceBodyDetails["url"] + "' target='_blank'>" + serviceBodyDetails["url"] + "</a>";
                content += "<br>Helpline: <a href=tel:'" + serviceBodyDetails["helpline"].split("|")[0] + "' target='_blank'>" + serviceBodyDetails["helpline"].split("|")[0] + "</a>";
                infoWindow.setContent(content);
                infoWindow.open(map);
                map.setCenter(pos);
            });
        }, function() {
            handleLocationError(true, infoWindow, map.getCenter());
        });
    } else {
        // Browser doesn't support Geolocation
        handleLocationError(false, infoWindow, map.getCenter());
    }
}

function handleLocationError(browserHasGeolocation, infoWindow, pos) {
    infoWindow.setPosition(pos);
    infoWindow.setContent(browserHasGeolocation ?
        'Error: The Geolocation service failed.' :
        'Error: Your browser doesn\'t support geolocation.');
    infoWindow.open(map);
}

/*function getCoordinatesForAddress(address, callback) {
    if (address.length > 0) {
        $.getJSON("https://maps.googleapis.com/maps/api/js?key=AIzaSyC7fOaF7ng-XsWP7yfElwpV_1-jrxtgwKg&address=" + encodeURIComponent(address)
            + "&components=country:us", function(data) {
            if (data["results"].length > 0) {
                callback({"latitude": data['results'][0]['geometry']['location']['lat'],
                    "longitude": data['results'][0]['geometry']['location']['lng']});
            }
        })
    } else {
        callback(null);
    }
}*/

function getServiceBodyById(id) {
    for (var service_body of service_bodies) {
        if (service_body["id"] === id) return service_body;
    }
}
