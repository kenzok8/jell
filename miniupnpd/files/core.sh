#!/bin/sh

#addrule ifname iaddr iport eport proto
#delrule eport proto

cmd=$1

test -e /usr/share/miniupnpd/nft.include || \
ln -s /tmp/run/miniupnpd.nft /usr/share/miniupnpd/nft.include && \
touch /tmp/run/miniupnpd.nft

case $cmd in
	addrule)
	ifname=$2
	iaddr=$3
	iport=$4
	eport=$5
	proto=$6
	nft -a list chain inet fw4 dstnat | grep -o "miniupnpd-$eport-$proto-dstnat.*" | while read _ _ _ handle; do nft delete rule inet fw4 dstnat handle $handle; done
	line="nft insert rule inet fw4 dstnat iifname $ifname meta nfproto ipv4 $proto dport $eport counter dnat to $iaddr:$iport comment miniupnpd-$eport-$proto-dstnat"
	$line;
	if [ "$proto" = "udp" ]; then
		grep "miniupnpd-$eport-$proto-dstnat" /tmp/run/miniupnpd.nft | while read _ _ _ _ _ _ _ _ _ _ _ _proto _ _eport _ _ _ _idst _; do
			_iaddr=${_idst/:*/}
			_iport=${_idst/*:/}
			sh /usr/share/natcapd/natcapd.cone_nat_unused.sh delrule $_iaddr $_iport $_eport
		done
		sh /usr/share/natcapd/natcapd.cone_nat_unused.sh addrule $iaddr $iport $eport
	fi
	sed -i "s/.*miniupnpd-$eport-$proto-dstnat/$line/" /tmp/run/miniupnpd.nft
	grep -q "miniupnpd-$eport-$proto-dstnat" /tmp/run/miniupnpd.nft || echo $line >>/tmp/run/miniupnpd.nft

	nft -a list chain inet fw4 forward_wan | grep -o "miniupnpd-$eport-$proto-forward_wan.*" | while read _ _ _ handle; do nft delete rule inet fw4 forward_wan handle $handle; done
	line="nft insert rule inet fw4 forward_wan ip daddr $iaddr $proto dport $iport counter accept comment miniupnpd-$eport-$proto-forward_wan"
	$line; sed -i "s/.*miniupnpd-$eport-$proto-forward_wan/$line/" /tmp/run/miniupnpd.nft
	grep -q "miniupnpd-$eport-$proto-forward_wan" /tmp/run/miniupnpd.nft || echo $line >>/tmp/run/miniupnpd.nft

	nft -a list chain inet fw4 srcnat | grep -o "miniupnpd-$eport-$proto-srcnat.*" | while read _ _ _ handle; do nft delete rule inet fw4 srcnat handle $handle; done
	line="nft insert rule inet fw4 srcnat ip saddr $iaddr $proto sport $iport counter masquerade to :$eport comment miniupnpd-$eport-$proto-srcnat"
	$line; sed -i "s/.*miniupnpd-$eport-$proto-srcnat/$line/" /tmp/run/miniupnpd.nft
	grep -q "miniupnpd-$eport-$proto-srcnat" /tmp/run/miniupnpd.nft || echo $line >>/tmp/run/miniupnpd.nft
	;;

	delrule)
	eport=$2
	proto=$3
	if [ "$proto" = "udp" ]; then
		grep "miniupnpd-$eport-$proto-dstnat" /tmp/run/miniupnpd.nft | while read _ _ _ _ _ _ _ _ _ _ _ _proto _ _eport _ _ _ _idst _; do
			_iaddr=${_idst/:*/}
			_iport=${_idst/*:/}
			sh /usr/share/natcapd/natcapd.cone_nat_unused.sh delrule $_iaddr $_iport $_eport
		done
	fi
	nft -a list chain inet fw4 dstnat | grep -o "miniupnpd-$eport-$proto-dstnat.*" | while read _ _ _ handle; do nft delete rule inet fw4 dstnat handle $handle; done
	sed -i "/.*miniupnpd-$eport-$proto-dstnat/d" /tmp/run/miniupnpd.nft

	nft -a list chain inet fw4 forward_wan | grep -o "miniupnpd-$eport-$proto-forward_wan.*" | while read _ _ _ handle; do nft delete rule inet fw4 forward_wan handle $handle; done
	sed -i "/.*miniupnpd-$eport-$proto-forward_wan/d" /tmp/run/miniupnpd.nft

	nft -a list chain inet fw4 srcnat | grep -o "miniupnpd-$eport-$proto-srcnat.*" | while read _ _ _ handle; do nft delete rule inet fw4 srcnat handle $handle; done
	sed -i "/.*miniupnpd-$eport-$proto-srcnat/d" /tmp/run/miniupnpd.nft
	;;

	stop)
	grep "miniupnpd-.*-udp-dstnat" /tmp/run/miniupnpd.nft | while read _ _ _ _ _ _ _ _ _ _ _ _proto _ _eport _ _ _ _idst _; do
		_iaddr=${_idst/:*/}
		_iport=${_idst/*:/}
		sh /usr/share/natcapd/natcapd.cone_nat_unused.sh delrule $_iaddr $_iport $_eport
	done
	nft -a list chain inet fw4 dstnat | grep -o "miniupnpd-.*-dstnat.*" | while read _ _ _ handle; do nft delete rule inet fw4 dstnat handle $handle; done
	nft -a list chain inet fw4 forward_wan | grep -o "miniupnpd-.*-forward_wan.*" | while read _ _ _ handle; do nft delete rule inet fw4 forward_wan handle $handle; done
	nft -a list chain inet fw4 srcnat | grep -o "miniupnpd-.*-srcnat.*" | while read _ _ _ handle; do nft delete rule inet fw4 srcnat handle $handle; done
	echo -n >/tmp/run/miniupnpd.nft
	;;

	delfwindex)
	handle=$2
	## iifname "pppoe-wan" meta nfproto ipv4 udp dport 1236 counter packets 0 bytes 0 dnat ip to 192.168.16.101:1234 comment "miniupnpd-1236-udp-dstnat" # handle 4625
	line=$(nft -a list chain inet fw4 dstnat | grep ".* # handle $handle$")
	proto=${line/* meta nfproto ipv4 /}
	eport=${proto/* dport /}
	eport=${eport/ counter */}
	proto=${proto/ dport */}
	lease=$(uci get upnpd.config.upnp_lease_file)
	test -f "$lease" && {
		PROTO=$(echo -n $proto | tr a-z A-Z)
		sed -i "/$PROTO:$eport:/d" "$lease"
	}
	sh $0 delrule $eport $proto
	;;
esac
