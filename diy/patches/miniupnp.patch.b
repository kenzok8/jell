--- a/miniupnpd/Makefile
+++ b/miniupnpd/Makefile
@@ -8,14 +8,15 @@
 include $(TOPDIR)/rules.mk
 
 PKG_NAME:=miniupnpd
-PKG_VERSION:=2.0.20170421
+PKG_VERSION:=3.0.20180503
 PKG_RELEASE:=3
 
 # Content-Encoding conflict, can refer to this [issue](https://github.com/miniupnp/miniupnp/issues/605)
 # so switch mirror repo to http://miniupnp.tuxfamily.org
 # PKG_SOURCE_URL:=http://miniupnp.free.fr/files
 PKG_SOURCE_URL:=http://miniupnp.tuxfamily.org/files
-PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
+PKG_SOURCE:=$(PKG_NAME)-2.0.20180503.tar.gz
+PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-2.0.20180503
 PKG_HASH:=9677aeccadf73b4bf8bb9d832c32b5da8266b4d58eed888f3fd43d7656405643
 
 PKG_MAINTAINER:=Markus Stenberg <fingon@iki.fi>
