package converter

type ProxyType string

const (
	ProxyTypeVMess  ProxyType = "vmess"
	ProxyTypeVLess  ProxyType = "vless"
	ProxyTypeTrojan ProxyType = "trojan"
	ProxyTypeSS     ProxyType = "ss"
)

type Proxy struct {
	Name            string                 `json:"name" yaml:"name"`
	Type            ProxyType              `json:"type" yaml:"type"`
	Server          string                 `json:"server" yaml:"server"`
	Port            int                    `json:"port" yaml:"port"`
	UUID            string                 `json:"uuid,omitempty" yaml:"uuid,omitempty"`
	Password        string                 `json:"password,omitempty" yaml:"password,omitempty"`
	Cipher          string                 `json:"cipher,omitempty" yaml:"cipher,omitempty"`
	UDP             bool                   `json:"udp,omitempty" yaml:"udp,omitempty"`
	TLS             bool                   `json:"tls,omitempty" yaml:"tls,omitempty"`
	SNI             string                 `json:"sni,omitempty" yaml:"sni,omitempty"`
	ALPN            []string               `json:"alpn,omitempty" yaml:"alpn,omitempty"`
	Network         string                 `json:"network,omitempty" yaml:"network,omitempty"`
	WSPath          string                 `json:"ws-path,omitempty" yaml:"ws-path,omitempty"`
	WSHeaders       map[string]string      `json:"ws-headers,omitempty" yaml:"ws-headers,omitempty"`
	GRPCServiceName string                 `json:"grpc-service-name,omitempty" yaml:"grpc-service-name,omitempty"`
	SplitHTTPPath   string                 `json:"splithttp-path,omitempty" yaml:"splithttp-path,omitempty"`
	XHTTPPath       string                 `json:"xhttp-path,omitempty" yaml:"xhttp-path,omitempty"`
	HTTPUpgradePath string                 `json:"httpupgrade-path,omitempty" yaml:"httpupgrade-path,omitempty"`
	Flow            string                 `json:"flow,omitempty" yaml:"flow,omitempty"`
	AlterId         int                    `json:"alterId,omitempty" yaml:"alterId,omitempty"`
	Plugin          string                 `json:"plugin,omitempty" yaml:"plugin,omitempty"`
	PluginOpts      map[string]interface{} `json:"plugin-opts,omitempty" yaml:"plugin-opts,omitempty"`
	SkipCertVerify  bool                   `json:"skip-cert-verify,omitempty" yaml:"skip-cert-verify,omitempty"`
}
