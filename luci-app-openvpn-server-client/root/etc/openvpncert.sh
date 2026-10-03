#!/bin/sh


rand_str() {
	(base64 /dev/urandom | tr -dc 'A-Za-z' | head -c $1) 2>/dev/null
}

rand_str_upper() {
	(rand_str $1 | tr 'a-z' 'A-Z') 2>/dev/null
}

rand_str_lower() {
	(rand_str $1 | tr 'A-Z' 'a-z') 2>/dev/null
}

set_easy_rsa_var() {
	local name="$1"
	local value="$2"

	if grep -q "^[[:space:]]*set_var[[:space:]]\+$name[[:space:]]" /etc/easy-rsa/vars; then
		sed -i "s|^[[:space:]]*set_var[[:space:]]\+$name[[:space:]].*$|set_var $name\t$value|" /etc/easy-rsa/vars
	else
		printf 'set_var %s\t%s\n' "$name" "$value" >> /etc/easy-rsa/vars
	fi
}

init_easy_rsa_vars() {
	touch /etc/easy-rsa/vars
	set_easy_rsa_var EASYRSA_OPENSSL '"openssl"'
	set_easy_rsa_var EASYRSA_KEY_SIZE '2048'
	set_easy_rsa_var EASYRSA_CA_EXPIRE '3650'
	set_easy_rsa_var EASYRSA_CERT_EXPIRE '3650'
}

rand_easy_rsa_vars() {
	local KEY_PROVINCE="$(rand_str_upper 6)"
	local KEY_CITY="$(rand_str 8)"
	local KEY_ORG="$(rand_str 8)"
	local KEY_EMAIL="$(rand_str_lower 8)@$(rand_str_lower 4).$(rand_str_lower 3)"
	local KEY_OU="$(rand_str 8)"
	set_easy_rsa_var EASYRSA_REQ_COUNTRY "\"$KEY_PROVINCE\""
	set_easy_rsa_var EASYRSA_REQ_PROVINCE "\"$KEY_CITY\""
	set_easy_rsa_var EASYRSA_REQ_CITY "\"$KEY_ORG\""
	set_easy_rsa_var EASYRSA_REQ_ORG "\"$KEY_ORG\""
	set_easy_rsa_var EASYRSA_REQ_EMAIL "\"$KEY_EMAIL\""
	set_easy_rsa_var EASYRSA_REQ_OU "\"$KEY_OU\""
}

init_easy_rsa_vars
rand_easy_rsa_vars


rm -rf /root/pki

export EASYRSA_PKI="/etc/easy-rsa/pki"
export EASYRSA_VARS_FILE="/etc/easy-rsa/vars"
export EASYRSA_CLI="easyrsa --batch"

echo -en "yes\nyes\n" | $EASYRSA_CLI init-pki
# Generate DH
$EASYRSA_CLI gen-dh

# Generate for the CA
$EASYRSA_CLI build-ca nopass

# Generate for the server
$EASYRSA_CLI build-server-full server nopass

# Generate for the client
$EASYRSA_CLI build-client-full client1 nopass

# Copy files
mkdir -p /etc/openvpn/pki
cp /etc/easy-rsa/pki/ca.crt /etc/openvpn/pki/
cp /etc/easy-rsa/pki/dh.pem /etc/openvpn/pki/
cp /etc/easy-rsa/pki/issued/server.crt /etc/openvpn/pki/
cp /etc/easy-rsa/pki/private/server.key /etc/openvpn/pki/
cp /etc/easy-rsa/pki/issued/client1.crt /etc/openvpn/pki/
cp /etc/easy-rsa/pki/private/client1.key /etc/openvpn/pki/
echo "OpenVPN Cert renew successfully"
