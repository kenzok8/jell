package generator

import (
	"strings"
	"testing"

	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/parser"
)

func boolp(b bool) *bool    { return &b }
func intp(i int) *int       { return &i }
func strp(s string) *string { return &s }

// parseLink runs the generated link back through the parser and returns the
// first node, so round-trips validate that links are syntactically correct.
func parseLink(t *testing.T, link string) model.ProxyNode {
	t.Helper()
	parsed := parser.Parse([]byte(link), "")
	if len(parsed.Nodes) != 1 {
		t.Fatalf("round-trip parse of %q produced %d nodes", link, len(parsed.Nodes))
	}
	return parsed.Nodes[0]
}

func TestLinksShadowsocks(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindShadowsocks, Name: "东京", Server: "1.2.3.4", Port: 8388,
		Cipher: "aes-256-gcm", Password: "pwd123",
	}
	link := Link(node)
	if !strings.HasPrefix(link, "ss://") {
		t.Fatalf("not an ss link: %q", link)
	}
	back := parseLink(t, link)
	if back.Server != "1.2.3.4" || back.Port != 8388 || back.Cipher != "aes-256-gcm" || back.Password != "pwd123" {
		t.Fatalf("round-trip mismatch: %+v", back)
	}
}

func TestLinksShadowsocksPlugin(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindShadowsocks, Name: "obs", Server: "1.2.3.4", Port: 8388,
		Cipher: "aes-256-gcm", Password: "pwd",
		Plugin: "v2ray-plugin", Transport: "ws", TLS: true, HostHeader: "h.example.com", Path: "ws",
	}
	link := Link(node)
	if !strings.Contains(link, "?plugin=") || !strings.Contains(link, "v2ray-plugin") {
		t.Fatalf("missing plugin: %q", link)
	}
	back := parseLink(t, link)
	if back.Plugin != "v2ray-plugin" || back.TLS != true || back.HostHeader != "h.example.com" {
		t.Fatalf("round-trip mismatch: %+v", back)
	}
}

func TestLinksShadowsocksR(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindShadowsocksR, Name: "ssr", Server: "1.2.3.4", Port: 8388,
		Cipher: "aes-128-ctr", Password: "pwd", ProtocolName: "auth_aes128_md5",
		ProtocolParam: "pp", Obfs: "tls1.2_ticket_auth", ObfsParam: "host",
	}
	link := Link(node)
	if !strings.HasPrefix(link, "ssr://") {
		t.Fatalf("not an ssr link: %q", link)
	}
	back := parseLink(t, link)
	if back.Server != "1.2.3.4" || back.Cipher != "aes-128-ctr" || back.Password != "pwd" ||
		back.ProtocolName != "auth_aes128_md5" || back.Obfs != "tls1.2_ticket_auth" {
		t.Fatalf("round-trip mismatch: %+v", back)
	}
}

func TestLinksShadowsocksRIPv6(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindShadowsocksR, Name: "v6", Server: "2001:db8::1", Port: 8388,
		Cipher: "aes-128-cfb", Password: "pwd", ProtocolName: "origin", Obfs: "plain",
	}
	back := parseLink(t, Link(node))
	if back.Server != node.Server || back.Port != node.Port || back.Password != node.Password {
		t.Fatalf("SSR IPv6 round-trip mismatch: %+v", back)
	}
}

func TestLinksShadowsocksUDPDisabled(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindShadowsocks, Name: "tcp only", Server: "node.example", Port: 8388,
		Cipher: "aes-256-gcm", Password: "pwd", UDPRelayEnabled: boolp(false),
		RawURI: "ss://old-without-udp-flag",
	}
	link := Link(node)
	if !strings.Contains(link, "udp-relay=false") {
		t.Fatalf("SS link lost UDP preference: %q", link)
	}
	back := parseLink(t, link)
	if back.UDPRelayEnabled == nil || *back.UDPRelayEnabled {
		t.Fatalf("SS link round-trip lost UDP preference: %+v", back)
	}
}

func TestShadowsocksUDPDisabledTargetOutput(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindShadowsocks, Name: "tcp only", Server: "node.example", Port: 8388,
		Cipher: "aes-256-gcm", Password: "pwd", UDPRelayEnabled: boolp(false),
	}
	if got := clashNode(node, model.ClientClashoo); !strings.Contains(got, "udp: false") {
		t.Fatalf("Clash lost SS UDP preference: %s", got)
	}
	if got := surgeNode(node, false); !strings.Contains(got, "udp-relay=false") {
		t.Fatalf("Surge lost SS UDP preference: %s", got)
	}
	if got := singBoxOutbound(node, "ss"); got["network"] != "tcp" {
		t.Fatalf("sing-box lost SS UDP preference: %+v", got)
	}
	scheme := &model.RuleScheme{Rules: []model.RuleSchemeRule{{Group: "DIRECT", Final: true}}}
	result := DAEPreflight(Options{Target: model.ClientDAE, Nodes: []model.ProxyNode{node}, Scheme: scheme, Strict: true})
	found := false
	for _, issue := range result.Issues {
		if issue.Code == "node_udp_relay" {
			found = true
		}
	}
	if !found {
		t.Fatalf("dae did not block unsupported SS UDP preference: %+v", result)
	}
}

func TestHysteria2PortHoppingSingBoxOutbound(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindHysteria2, Name: "hop", Server: "hy.example", Port: 443,
		Password: "pwd", PortHopping: "443,20000-20100",
	}
	got := singBoxOutbound(node, "hy2")
	ports, ok := got["server_ports"].([]string)
	if !ok || len(ports) != 2 || ports[0] != "443:443" || ports[1] != "20000:20100" {
		t.Fatalf("sing-box lost Hysteria2 port list: %+v", got)
	}
	if _, present := got["server_port"]; present {
		t.Fatalf("sing-box emitted conflicting server_port: %+v", got)
	}
	back := parseLink(t, Link(node))
	if back.PortHopping != node.PortHopping || back.Port != node.Port {
		t.Fatalf("Hysteria2 port list round-trip mismatch: %+v", back)
	}
	if !validDAENodeURI(node, Link(node)) {
		t.Fatal("dae preflight rejected an official Hysteria2 multi-port URI")
	}
}

func TestLinksVMess(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindVMess, Name: "vm", Server: "1.2.3.4", Port: 443,
		UUID: "b831381d-6324-4d53-ad4f-8cda48b30811", AlterID: intp(2),
		Transport: "ws", HostHeader: "h.example.com", Path: "/ws", TLS: true,
	}
	link := Link(node)
	if !strings.HasPrefix(link, "vmess://") {
		t.Fatalf("not a vmess link: %q", link)
	}
	back := parseLink(t, link)
	if back.Server != "1.2.3.4" || back.UUID != "b831381d-6324-4d53-ad4f-8cda48b30811" ||
		back.Transport != "ws" || back.Path != "/ws" || back.HostHeader != "h.example.com" || !back.TLS {
		t.Fatalf("round-trip mismatch: %+v", back)
	}
}

func TestLinksVLESSReality(t *testing.T) {
	node := model.ProxyNode{
		Kind: model.KindVLESS, Name: "reality", Server: "2.3.4.5", Port: 443,
		UUID:             "b831381d-6324-4d53-ad4f-8cda48b30811",
		RealityPublicKey: "pubkey", RealityShortID: "abcd", Fingerprint: "chrome",
		Flow: "xtls-rprx-vision", SNI: "www.apple.com", TLS: true,
	}
	link := Link(node)
	if !strings.HasPrefix(link, "vless://") {
		t.Fatalf("not a vless link: %q", link)
	}
	for _, want := range []string{"security=reality", "pbk=pubkey", "sid=abcd", "fp=chrome", "flow=xtls-rprx-vision", "sni=www.apple.com"} {
		if !strings.Contains(link, want) {
			t.Fatalf("missing %q in %q", want, link)
		}
	}
	back := parseLink(t, link)
	if back.RealityPublicKey != "pubkey" || back.RealityShortID != "abcd" || back.Flow != "xtls-rprx-vision" {
		t.Fatalf("round-trip mismatch: %+v", back)
	}
}

func TestLinksTrojanHysteria2Tuic(t *testing.T) {
	trojan := model.ProxyNode{Kind: model.KindTrojan, Name: "tj", Server: "3.4.5.6", Port: 443, Password: "secret"}
	if l := Link(trojan); !strings.HasPrefix(l, "trojan://secret@3.4.5.6:443") {
		t.Fatalf("trojan link wrong: %q", l)
	}

	hy2 := model.ProxyNode{
		Kind: model.KindHysteria2, Name: "hy2", Server: "4.5.6.7", Port: 443, Password: "pw",
		Obfs: "salamander", ObfsParam: "obfspw", PortHopping: "20000-50000",
		CertificateFingerprint: "pin",
	}
	l := Link(hy2)
	for _, want := range []string{"hysteria2://pw@4.5.6.7:20000-50000", "obfs=salamander", "obfs-password=obfspw", "pinSHA256=pin"} {
		if !strings.Contains(l, want) {
			t.Fatalf("missing %q in %q", want, l)
		}
	}
	if !validDAENodeURI(hy2, l) {
		t.Fatal("dae preflight rejected a valid port list with a different base port")
	}

	tuic := model.ProxyNode{
		Kind: model.KindTUIC, Name: "tuic", Server: "5.6.7.8", Port: 443,
		UUID: "b831381d-6324-4d53-ad4f-8cda48b30811", Password: "tpw",
		CongestionControl: "bbr", UDPRelayMode: "native",
	}
	l = Link(tuic)
	if !strings.Contains(l, "tuic://b831381d-6324-4d53-ad4f-8cda48b30811:tpw@5.6.7.8:443") {
		t.Fatalf("tuic link wrong: %q", l)
	}
	for _, want := range []string{"congestion_control=bbr", "udp_relay_mode=native"} {
		if !strings.Contains(l, want) {
			t.Fatalf("missing %q in %q", want, l)
		}
	}
}

func TestLinksWireGuardSnell(t *testing.T) {
	wg := model.ProxyNode{
		Kind: model.KindWireGuard, Name: "wg", Server: "6.7.8.9", Port: 51820,
		WireGuardPrivateKey: "privkey", WireGuardPublicKey: "pubkey",
		WireGuardIPv4: "10.0.0.2/32",
	}
	l := Link(wg)
	if !strings.HasPrefix(l, "wireguard://privkey@6.7.8.9:51820") || !strings.Contains(l, "publickey=pubkey") {
		t.Fatalf("wireguard link wrong: %q", l)
	}
	back := parseLink(t, l)
	if back.Kind != model.KindWireGuard || back.WireGuardPrivateKey != "privkey" ||
		back.WireGuardPublicKey != "pubkey" || back.WireGuardIPv4 != "10.0.0.2/32" {
		t.Fatalf("wireguard round-trip mismatch: %+v", back)
	}

	snell := model.ProxyNode{Kind: model.KindSnell, Name: "sn", Server: "7.8.9.1", Port: 123, Password: "psk", Version: intp(3)}
	ls := Link(snell)
	if !strings.HasPrefix(ls, "sn = snell") || !strings.Contains(ls, "psk=psk") || !strings.Contains(ls, "version=3") {
		t.Fatalf("snell line wrong: %q", ls)
	}
}

func TestLinkReusesRawURI(t *testing.T) {
	raw := "vmess://eyJ2IjoiMiJ9"
	node := model.ProxyNode{Kind: model.KindVMess, Name: "x", Server: "0.0.0.0", Port: 1, RawURI: raw}
	if Link(node) != raw {
		t.Fatalf("raw URI not reused: %q", Link(node))
	}
}

func TestLinksSkipsMetadataAndUnknown(t *testing.T) {
	nodes := []model.ProxyNode{
		{ID: "a", Kind: model.KindUnknown, Name: "u"},
		{ID: "b", Kind: model.KindShadowsocks, Name: "ok", Server: "1.2.3.4", Port: 1, Cipher: "c", Password: "p", IsSubscriptionMetadata: boolp(true)},
		{ID: "c", Kind: model.KindShadowsocks, Name: "good", Server: "1.2.3.4", Port: 1, Cipher: "c", Password: "p"},
	}
	got := Links(nodes)
	if len(got) != 1 || got[0].ID != "c" {
		t.Fatalf("unexpected links: %+v", got)
	}
}
