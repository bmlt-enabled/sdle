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

function getMeetingsForServiceBody(id, recurse, callback) {
    var url = "/client_interface/jsonp/?switcher=GetSearchResults&data_field_key=latitude,longitude&services[]=" + id;
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

    google.maps.event.addListener(map,'click',function(e) {
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
        var parentServiceBody = getServiceBodyById(serviceBodyDetails['parent_id']);
        if (parseInt(data[0]["distance_in_miles"]) < 100) {
            var content = "<b><a href='javascript:drawServiceBody(" + serviceBodyDetails['id'] + ", false);'>" + serviceBodyDetails["name"] + "</a></b> (<a href='javascript:drawServiceBody(" + serviceBodyDetails['parent_id'] + ", true);'>" + parentServiceBody['name'] + "</a>)";
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

function Point(lat, lon) {
    this.x = (lon + 180) * 360;
    this.y = (lat + 90) * 180;
    this.latitude = lat;
    this.longitude = lon;

    this.distance=function(that) {
        var dX = that.x - this.x;
        var dY = that.y - this.y;
        return Math.sqrt((dX*dX) + (dY*dY));
    };

    this.slope=function(that) {
        var dX = that.x - this.x;
        var dY = that.y - this.y;
        return dY / dX;
    };

    this.toString=function() {
        return this.label;
    };
}

// Find the upper most point. In case of a tie, get the left most point.
function upperLeft(points) {
    var top = points[0];
    for(var i = 1; i < points.length; i++) {
        var temp = points[i];
        if(temp.y > top.y || (temp.y === top.y && temp.x < top.x)) {
            top = temp;
        }
    }

    return top;
}

function drawServiceBody(id, recurse) {
    var points = [];
    var service_bodies_coords = [];
    getMeetingsForServiceBody(id, recurse, function(data) {
        for (var i = 0; i < data.length; i++) {
            var meeting = data[i];
            points.push(new Point(meeting.latitude, meeting.longitude));
        }

        var upper = upperLeft(points);

        points.sort(function (p1, p2) {
            // Exclude the 'upper' point from the sort (which should come first).
            if(p1 === upper) return -1;
            if(p2 === upper) return 1;

            // Find the slopes of 'p1' and 'p2' when a line is
            // drawn from those points through the 'upper' point.
            var m1 = upper.slope(p1);
            var m2 = upper.slope(p2);

            // 'p1' and 'p2' are on the same line towards 'upper'.
            if(m1 === m2) {
                // The point closest to 'upper' will come first.
                return p1.distance(upper) < p2.distance(upper) ? -1 : 1;
            }

            // If 'p1' is to the right of 'upper' and 'p2' is the the left.
            if(m1 <= 0 && m2 > 0) return -1;

            // If 'p1' is to the left of 'upper' and 'p2' is the the right.
            if(m1 > 0 && m2 <= 0) return 1;

            // It seems that both slopes are either positive, or negative.
            return m1 > m2 ? -1 : 1;
        });

        for (var p = 0; p < points.length; p++) {
            var point = points[p];
            service_bodies_coords.push({
                lat: parseFloat(point.latitude), lng: parseFloat(point.longitude)
            })
        }

        // Construct the polygon.
        var serviceBodyPolygon = new google.maps.Polygon({
            paths: service_bodies_coords,
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35
        });
        serviceBodyPolygon.setMap(map);
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
