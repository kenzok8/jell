package parser

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/kenzok8/tower/internal/model"
)

func TestParseSSBase64List(t *testing.T) {
	lines := []string{
		"ss://" + b64("aes-256-gcm:password1@1.2.3.4:8388") + "#香港 01",
		"ss://" + b64("chacha20-ietf-poly1305:password2@5.6.7.8:8388") + "#日本 02",
	}
	payload := base64.StdEncoding.EncodeToString([]byte(strings.Join(lines, "\n")))

	got := Parse([]byte(payload), "src1")
	if len(got.Nodes) != 2 {
		t.Fatalf("want 2 nodes, got %d (rejected %d)", len(got.Nodes), got.RejectedLineCount)
	}
	n := got.Nodes[0]
	if n.Kind != model.KindShadowsocks || n.Server != "1.2.3.4" || n.Port != 8388 {
		t.Errorf("node0 parsed wrong: %+v", n)
	}
	if n.Cipher != "aes-256-gcm" || n.Password != "password1" {
		t.Errorf("node0 credentials wrong: %+v", n)
	}
	if n.Name != "香港 01" {
		t.Errorf("node0 name = %q, want 香港 01", n.Name)
	}
}

func TestParseExcludesRenewalNotice(t *testing.T) {
	lines := []string{
		"ss://" + b64("aes-256-gcm:password1@203.0.113.10:8388") + "#香港 01",
		"ss://" + b64("aes-256-gcm:password2@203.0.113.11:8388") + "#急续费节点-10X",
	}
	got := Parse([]byte(strings.Join(lines, "\n")), "src1")
	if len(got.Nodes) != 1 || got.Nodes[0].Name != "香港 01" {
		t.Fatalf("renewal notice remained in nodes: %#v", got.Nodes)
	}
	if len(got.Notices) != 1 || got.Notices[0] != "急续费节点-10X" {
		t.Fatalf("renewal notice was not retained as a notice: %#v", got.Notices)
	}
}

func TestParseSSR(t *testing.T) {
	// ssr://base64(host:port:protocol:method:obfs:base64(password)/?remarks=base64(...))
	inner := "1.2.3.4:8388:auth_aes128_md5:aes-128-cfb:tls1.2_ticket_auth:" + base64.StdEncoding.EncodeToString([]byte("pass123"))
	full := inner + "/?remarks=" + base64.StdEncoding.EncodeToString([]byte("台湾节点"))
	uri := "ssr://" + base64.StdEncoding.EncodeToString([]byte(full))

	n := ParseURI(uri, "")
	if n == nil {
		t.Fatal("ssr parse returned nil")
	}
	if n.Kind != model.KindShadowsocksR || n.Server != "1.2.3.4" || n.Port != 8388 {
		t.Errorf("ssr parsed wrong: %+v", n)
	}
	if n.Password != "pass123" || n.ProtocolName != "auth_aes128_md5" || n.Cipher != "aes-128-cfb" {
		t.Errorf("ssr fields wrong: %+v", n)
	}
	if n.Name != "台湾节点" {
		t.Errorf("ssr name = %q", n.Name)
	}
}

func TestParseSSRIPv6(t *testing.T) {
	for _, host := range []string{"2001:db8::1", "[2001:db8::1]"} {
		inner := host + ":8388:origin:aes-128-cfb:plain:" + b64("secret")
		n := ParseURI("ssr://"+b64(inner), "")
		if n == nil || n.Server != "2001:db8::1" || n.Port != 8388 || n.Password != "secret" {
			t.Fatalf("SSR IPv6 %q parsed as %+v", host, n)
		}
	}
}

func TestParseHysteria2AuthorityPorts(t *testing.T) {
	for _, tc := range []struct {
		link, host, ports string
		port              int
	}{
		{"hysteria2://pw@hy.example:443,20000-20100#HY", "hy.example", "443,20000-20100", 443},
		{"hy2://pw@[2001:db8::1]:20000-20100#V6", "2001:db8::1", "20000-20100", 20000},
		{"hysteria2://pw@hy.example#Default", "hy.example", "", 443},
	} {
		n := ParseURI(tc.link, "")
		if n == nil || n.Server != tc.host || n.Port != tc.port || n.PortHopping != tc.ports {
			t.Fatalf("Hysteria2 %q parsed as %+v", tc.link, n)
		}
	}
	for _, ports := range []string{"0,443", "443,65536", "5000-4000", "443,,5000", "443-bad"} {
		if n := ParseURI("hy2://pw@hy.example:"+ports, ""); n != nil {
			t.Fatalf("invalid Hysteria2 ports %q accepted: %+v", ports, n)
		}
	}
}

func TestParseShadowsocksUDPPreference(t *testing.T) {
	for _, tc := range []struct {
		query string
		want  *bool
	}{
		{"", nil}, {"?udp-relay=false", boolPointer(false)}, {"?udp=1", boolPointer(true)},
	} {
		n := ParseURI("ss://"+b64("aes-256-gcm:secret")+"@node.example:8388"+tc.query, "")
		if n == nil || (n.UDPRelayEnabled == nil) != (tc.want == nil) || n.UDPRelayEnabled != nil && *n.UDPRelayEnabled != *tc.want {
			t.Fatalf("Shadowsocks UDP query %q parsed as %+v", tc.query, n)
		}
	}
	for _, source := range []string{
		"proxies:\n  - name: ss\n    type: ss\n    server: node.example\n    port: 8388\n    cipher: aes-256-gcm\n    password: secret\n    udp: false\n",
		"[Proxy]\nss = ss, node.example, 8388, encrypt-method=aes-256-gcm, password=secret, udp-relay=false\n",
	} {
		got := Parse([]byte(source), "")
		if len(got.Nodes) != 1 || got.Nodes[0].UDPRelayEnabled == nil || *got.Nodes[0].UDPRelayEnabled {
			t.Fatalf("Shadowsocks UDP disabled lost: %+v", got)
		}
	}
}

func boolPointer(value bool) *bool { return &value }

func TestParseVMessJSON(t *testing.T) {
	json := `{"v":"2","ps":"香港 IEPL","add":"hk.example.com","port":"443","id":"12345678-1234-4321-8765-123456789abc","aid":"0","net":"ws","path":"/ws","tls":"tls","host":"hk.example.com"}`
	uri := "vmess://" + base64.StdEncoding.EncodeToString([]byte(json))

	n := ParseURI(uri, "")
	if n == nil {
		t.Fatal("vmess parse returned nil")
	}
	if n.Kind != model.KindVMess || n.Server != "hk.example.com" || n.Port != 443 {
		t.Errorf("vmess parsed wrong: %+v", n)
	}
	if n.UUID != "12345678-1234-4321-8765-123456789abc" || n.Transport != "ws" || !n.TLS {
		t.Errorf("vmess fields wrong: %+v", n)
	}
	if n.Path != "/ws" || n.HostHeader != "hk.example.com" {
		t.Errorf("vmess ws fields wrong: %+v", n)
	}
}

func TestParseTrojan(t *testing.T) {
	n := ParseURI("trojan://password@example.com:443?sni=example.com&type=ws&path=%2Fws#Trojan节点", "")
	if n == nil {
		t.Fatal("trojan parse returned nil")
	}
	if n.Kind != model.KindTrojan || n.Server != "example.com" || n.Port != 443 {
		t.Errorf("trojan parsed wrong: %+v", n)
	}
	if n.Password != "password" || !n.TLS || n.SNI != "example.com" {
		t.Errorf("trojan fields wrong: %+v", n)
	}
	if n.Transport != "ws" || n.Path != "/ws" {
		t.Errorf("trojan ws fields wrong: %+v", n)
	}
	if n.Name != "Trojan节点" {
		t.Errorf("trojan name = %q", n.Name)
	}
}

func TestParseVLESSReality(t *testing.T) {
	n := ParseURI("vless://12345678-1234-4321-8765-123456789abc@example.com:443?security=reality&pbk=pubkey&sid=abcd&fp=chrome&type=tcp&flow=xtls-rprx-vision&sni=yahoo.com#REALITY", "")
	if n == nil {
		t.Fatal("vless parse returned nil")
	}
	if n.Kind != model.KindVLESS || !n.UsesReality() {
		t.Errorf("vless reality wrong: %+v", n)
	}
	if n.RealityPublicKey != "pubkey" || n.RealityShortID != "abcd" || n.Flow != "xtls-rprx-vision" {
		t.Errorf("vless reality fields wrong: %+v", n)
	}
}

func TestParseClashYAML(t *testing.T) {
	doc := `
proxies:
  - name: "香港 01"
    type: ss
    server: hk.example.com
    port: 8388
    cipher: aes-256-gcm
    password: "pass123"
  - name: "日本 02"
    type: vmess
    server: jp.example.com
    port: 443
    uuid: 12345678-1234-4321-8765-123456789abc
    alterId: 0
    cipher: auto
    tls: true
    network: ws
    ws-opts:
      path: /ws
      headers:
        Host: jp.example.com
`
	got := Parse([]byte(doc), "src")
	if len(got.Nodes) != 2 {
		t.Fatalf("want 2 nodes, got %d (rejected %d)", len(got.Nodes), got.RejectedLineCount)
	}
	n0 := got.Nodes[0]
	if n0.Kind != model.KindShadowsocks || n0.Server != "hk.example.com" || n0.Cipher != "aes-256-gcm" {
		t.Errorf("clash ss node wrong: %+v", n0)
	}
	n1 := got.Nodes[1]
	if n1.Kind != model.KindVMess || n1.Transport != "ws" || n1.Path != "/ws" || n1.HostHeader != "jp.example.com" {
		t.Errorf("clash vmess node wrong: %+v", n1)
	}
}

func TestParseSurgeINI(t *testing.T) {
	doc := `
[General]
loglevel = notify

[Proxy]
香港 01 = ss, hk.example.com, 8388, encrypt-method=aes-256-gcm, password=pass123, obfs=http, obfs-host=www.bing.com

[Rule]
FINAL,DIRECT
`
	got := Parse([]byte(doc), "src")
	if len(got.Nodes) != 1 {
		t.Fatalf("want 1 node, got %d (rejected %d)", len(got.Nodes), got.RejectedLineCount)
	}
	n := got.Nodes[0]
	if n.Kind != model.KindShadowsocks || n.Server != "hk.example.com" || n.Cipher != "aes-256-gcm" || n.Password != "pass123" {
		t.Errorf("surge node wrong: %+v", n)
	}
	if n.Obfs != "http" || n.ObfsParam != "www.bing.com" {
		t.Errorf("surge obfs wrong: %+v", n)
	}
}

func b64(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}
