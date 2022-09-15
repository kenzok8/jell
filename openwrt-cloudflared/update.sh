#!/bin/sh
hash=$1
sha=$(proxychains curl "https://codeload.github.com/cloudflare/cloudflared/tar.gz/{$hash}" | sha256sum - | awk '{print $1'})
sed "s/^PKG_VERSION.*/PKG_VERSION:=${hash}/g" Makefile > Makefile1
sed "s/^PKG_HASH.*/PKG_HASH:=${sha}/g" Makefile1 > Makefile2
rm Makefile1 Makefile
mv Makefile2 Makefile
