# sdle

SDLE = Service Delivery Locator Engine

Queries the Tomato server and find the service body that seems to cover a geopolitical location.

To test locally you can do the following (this requires you have ngrok and python installed):

```shell
> python -m SimpleHTTPServer 8008
> ngrok http 8008
```

**You must use ngrok to test the KML layering feature because Google Maps needs to be able to pull the data from a public server.**