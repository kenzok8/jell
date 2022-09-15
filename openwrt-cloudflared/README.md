# cloudflared for OpenWrt

Really convenient for exposing services behind NAT.

See [https://developers.cloudflare.com/cloudflare-one/connections/connect-apps](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps) for details.

Note that you are supposed to move configuration files from `/root/.cloudflared` to `/etc/cloudflared` once you have finished tunnel setup.

## Todo

* [ ] DNS over HTTPS proxy server
* [ ] Access ([https://developers.cloudflare.com/cloudflare-one/applications/non-http](https://developers.cloudflare.com/cloudflare-one/applications/non-http))
* [ ] LuCI
