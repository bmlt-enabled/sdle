var service_bodies = [];
var root = "https://tomato.na-bmlt.org/main_server/";

$.getJSON(root + "client_interface/jsonp/?switcher=GetServiceBodies&callback=?", function(data) {
    service_bodies = data;
});

function search() {
    getCoordinatesForAddress($("#searchterm").val(), function(data) {
        $.getJSON(root + "/client_interface/jsonp/?switcher=GetSearchResults&geo_width=-10&long_val=" + data["longitude"] + "&lat_val=" + data["latitude"] + "&callback=?", function(data) {
            $("#response").html(getServiceBodyById(data[0]["service_body_bigint"])["name"]);
        })
    })
}

function getCoordinatesForAddress(address, callback) {
    console.log(address)
    if (address.length > 0) {
        $.getJSON("https://maps.googleapis.com/maps/api/geocode/json?key=AIzaSyDkYPILF4PxtyT5c9o95rsSXN57ZkJy0NI&address=" + encodeURIComponent(address)
            + "&components=country:us", function(data) {
            console.log(data)
            if (data["results"].length > 0) {
                callback({"latitude": data['results'][0]['geometry']['location']['lat'],
                    "longitude": data['results'][0]['geometry']['location']['lng']});
            }
        })
    } else {
        callback(null);
    }
}

function getServiceBodyById(id) {
    for (var service_body of service_bodies) {
        if (service_body["id"] === id) return service_body;
    }
}
