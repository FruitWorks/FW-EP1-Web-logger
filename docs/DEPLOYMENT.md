# Deployment — FruitWorks EP1 Web Logger V1

## Production
Serve the `web/` directory from an HTTPS origin. Web Bluetooth requires a secure context. A normal static host is sufficient; there is no backend.

## Development
A local HTTP origin such as `http://localhost` is treated specially by browsers, but the intended production path is HTTPS. For remote access use HTTPS.

## Server requirements
- static file hosting only
- HTTPS
- no JavaScript build step required
- no database
- no API
- no WebSocket

## Permissions
Keep the page top-level and same-origin. Do not embed the Bluetooth application in a cross-origin iframe.
