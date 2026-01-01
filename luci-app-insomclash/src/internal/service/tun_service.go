package service

import (
	"fmt"
	"net"
	"strings"
	"time"

	"fusiontunx/pkg/config"
	"fusiontunx/pkg/logger"

	"github.com/sagernet/nftables"
	"github.com/sagernet/nftables/expr"
	"github.com/vishvananda/netlink"
	"golang.org/x/sys/unix"
)

type TUNService struct {
	conn         *nftables.Conn
	tunDevice    string
	tunTableID   int
	tunMark      uint32
	useOpenWrtFw bool
}

func NewTUNService() *TUNService {
	return &TUNService{
		tunDevice:  "Meta",
		tunTableID: 200,
		tunMark:    200,
	}
}

func (t *TUNService) Setup(conn *nftables.Conn, routingConfig config.RoutingConfig) error {
	t.conn = conn

	if routingConfig.TunDevice != "" {
		t.tunDevice = routingConfig.TunDevice
	}

	t.useOpenWrtFw = t.detectOpenWrtFw4()
	if t.useOpenWrtFw {
		logger.Info("Detected OpenWrt fw4, using fw4 chains for TUN routing")
	} else {
		logger.Info("Using standalone nftables table for TUN routing")
	}

	logger.Debug("TUN: Creating routing table")
	if err := t.createRoutingTable(); err != nil {
		logger.Errorf("TUN: createRoutingTable failed: %v", err)
		return fmt.Errorf("failed to create routing table: %w", err)
	}
	logger.Debug("TUN: createRoutingTable completed")

	logger.Debug("TUN: Creating nftables rules")
	if err := t.createRules(routingConfig); err != nil {
		logger.Errorf("TUN: createRules failed: %v", err)
		return fmt.Errorf("failed to create TUN rules: %w", err)
	}
	logger.Debug("TUN: createRules completed")

	return nil
}

func (t *TUNService) Cleanup(conn *nftables.Conn) error {
	t.conn = conn

	logger.Debug("TUN: Cleaning up routing rules")
	rule := netlink.NewRule()
	rule.Mark = t.tunMark
	mask := uint32(0xffffffff)
	rule.Mask = &mask
	rule.Table = t.tunTableID
	rule.Priority = 100
	netlink.RuleDel(rule)

	link, err := netlink.LinkByName(t.tunDevice)
	if err == nil {
		route := &netlink.Route{
			Dst:       &net.IPNet{IP: net.ParseIP("0.0.0.0"), Mask: net.CIDRMask(0, 32)},
			LinkIndex: link.Attrs().Index,
			Table:     t.tunTableID,
		}
		netlink.RouteDel(route)
	}

	logger.Debug("TUN: Deleting nftables rules")
	if err := t.deleteRules(); err != nil {
		return err
	}

	logger.Info("TUN cleanup successful")
	return nil
}

func (t *TUNService) detectOpenWrtFw4() bool {
	nft, err := nftables.New()
	if err != nil {
		return false
	}

	tables, err := nft.ListTables()
	if err != nil {
		return false
	}

	for _, table := range tables {
		if table.Name == "fw4" && table.Family == nftables.TableFamilyINet {
			return true
		}
	}
	return false
}

func (t *TUNService) createRoutingTable() error {
	maxRetries := 20
	var link netlink.Link
	var err error

	for i := 0; i < maxRetries; i++ {
		link, err = netlink.LinkByName(t.tunDevice)
		if err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	if err != nil {
		return fmt.Errorf("TUN device %s not found after waiting: %w", t.tunDevice, err)
	}

	rule := netlink.NewRule()
	rule.Mark = t.tunMark
	mask := uint32(0xffffffff)
	rule.Mask = &mask
	rule.Table = t.tunTableID
	rule.Priority = 100
	if err := netlink.RuleAdd(rule); err != nil {
		if !strings.Contains(err.Error(), "file exists") {
			return fmt.Errorf("failed to add routing rule: %w", err)
		}
	}

	route := &netlink.Route{
		Dst:       &net.IPNet{IP: net.ParseIP("0.0.0.0"), Mask: net.CIDRMask(0, 32)},
		LinkIndex: link.Attrs().Index,
		Table:     t.tunTableID,
	}
	if err := netlink.RouteAdd(route); err != nil {
		if !strings.Contains(err.Error(), "file exists") {
			return fmt.Errorf("failed to add route: %w", err)
		}
	}

	logger.Info("TUN routing table created successfully")
	return nil
}

func (t *TUNService) createRules(routingConfig config.RoutingConfig) error {
	if t.useOpenWrtFw {
		return t.createOpenWrtFw4Rules(routingConfig)
	}
	return t.createStandaloneRules(routingConfig)
}

func (t *TUNService) createOpenWrtFw4Rules(routingConfig config.RoutingConfig) error {
	fw4Table := &nftables.Table{
		Family: nftables.TableFamilyINet,
		Name:   "fw4",
	}

	chains, err := t.conn.ListChains()
	if err != nil {
		return fmt.Errorf("failed to list chains: %w", err)
	}

	var forwardChain, inputChain, srcnatChain *nftables.Chain
	for _, chain := range chains {
		if chain.Table.Name == "fw4" && chain.Table.Family == nftables.TableFamilyINet {
			switch chain.Name {
			case "forward":
				forwardChain = chain
			case "input":
				inputChain = chain
			case "srcnat":
				srcnatChain = chain
			}
		}
	}

	if forwardChain == nil || inputChain == nil || srcnatChain == nil {
		return fmt.Errorf("fw4 chains not found")
	}

	tunDeviceBytes := append([]byte(t.tunDevice), 0)

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    forwardChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{unix.IPPROTO_TCP},
			},
			&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
		UserData: []byte("FusionTunX TUN Forward Out"),
	})

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    forwardChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{unix.IPPROTO_UDP},
			},
			&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
		UserData: []byte("FusionTunX TUN Forward Out"),
	})

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    forwardChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{unix.IPPROTO_TCP},
			},
			&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
		UserData: []byte("FusionTunX TUN Forward In"),
	})

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    forwardChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{unix.IPPROTO_UDP},
			},
			&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
		UserData: []byte("FusionTunX TUN Forward In"),
	})

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    inputChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{unix.IPPROTO_TCP},
			},
			&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
		UserData: []byte("FusionTunX TUN Input"),
	})

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    inputChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{unix.IPPROTO_UDP},
			},
			&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
		UserData: []byte("FusionTunX TUN Input"),
	})

	t.conn.InsertRule(&nftables.Rule{
		Table:    fw4Table,
		Chain:    srcnatChain,
		Position: 0,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyNFPROTO, Register: 1},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 1,
				Data:     []byte{byte(nftables.TableFamilyIPv4)},
			},
			&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 2},
			&expr.Cmp{
				Op:       expr.CmpOpEq,
				Register: 2,
				Data:     tunDeviceBytes,
			},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictReturn},
		},
		UserData: []byte("FusionTunX TUN Postrouting"),
	})

	return t.createMarkingRules(routingConfig)
}

func (t *TUNService) createMarkingRules(routingConfig config.RoutingConfig) error {
	mangle := t.conn.AddTable(&nftables.Table{
		Family: nftables.TableFamilyIPv4,
		Name:   "fusiontunx_tun",
	})

	prerouting := t.conn.AddChain(&nftables.Chain{
		Name:     "prerouting",
		Table:    mangle,
		Type:     nftables.ChainTypeFilter,
		Hooknum:  nftables.ChainHookPrerouting,
		Priority: nftables.ChainPriorityMangle,
	})

	t.conn.AddRule(&nftables.Rule{
		Table: mangle,
		Chain: prerouting,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte("lo\x00")},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
	})

	t.conn.AddRule(&nftables.Rule{
		Table: mangle,
		Chain: prerouting,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyIIFNAME, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: append([]byte(t.tunDevice), 0)},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
	})

	localNetworks := []struct {
		ip   net.IP
		mask net.IPMask
	}{
		{ip: net.IPv4(127, 0, 0, 0), mask: net.CIDRMask(8, 32)},
		{ip: net.IPv4(10, 0, 0, 0), mask: net.CIDRMask(8, 32)},
		{ip: net.IPv4(172, 16, 0, 0), mask: net.CIDRMask(12, 32)},
		{ip: net.IPv4(192, 168, 0, 0), mask: net.CIDRMask(16, 32)},
	}

	for _, network := range localNetworks {
		ip := network.ip.To4()
		mask := []byte(network.mask)
		if ip == nil || len(mask) != 4 {
			continue
		}

		t.conn.AddRule(&nftables.Rule{
			Table: mangle,
			Chain: prerouting,
			Exprs: []expr.Any{
				&expr.Payload{
					DestRegister: 1,
					Base:         expr.PayloadBaseNetworkHeader,
					Offset:       16,
					Len:          4,
				},
				&expr.Bitwise{
					SourceRegister: 1,
					DestRegister:   1,
					Len:            4,
					Mask:           mask,
					Xor:            []byte{0, 0, 0, 0},
				},
				&expr.Cmp{
					Op:       expr.CmpOpEq,
					Register: 1,
					Data:     ip,
				},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	markData := []byte{byte(t.tunMark >> 24), byte(t.tunMark >> 16), byte(t.tunMark >> 8), byte(t.tunMark)}

	if routingConfig.TCP == config.RoutingModeTUN {
		t.conn.AddRule(&nftables.Rule{
			Table: mangle,
			Chain: prerouting,
			Exprs: []expr.Any{
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte{0, 0, 0, 0}},
				&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 2},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 2, Data: []byte{unix.IPPROTO_TCP}},
				&expr.Immediate{Register: 1, Data: markData},
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1, SourceRegister: true},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	if routingConfig.UDP == config.RoutingModeTUN {
		t.conn.AddRule(&nftables.Rule{
			Table: mangle,
			Chain: prerouting,
			Exprs: []expr.Any{
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte{0, 0, 0, 0}},
				&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 2},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 2, Data: []byte{unix.IPPROTO_UDP}},
				&expr.Immediate{Register: 1, Data: markData},
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1, SourceRegister: true},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	output := t.conn.AddChain(&nftables.Chain{
		Name:     "output",
		Table:    mangle,
		Type:     nftables.ChainTypeRoute,
		Hooknum:  nftables.ChainHookOutput,
		Priority: nftables.ChainPriorityMangle,
	})

	t.conn.AddRule(&nftables.Rule{
		Table: mangle,
		Chain: output,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte("lo\x00")},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
	})

	t.conn.AddRule(&nftables.Rule{
		Table: mangle,
		Chain: output,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: append([]byte(t.tunDevice), 0)},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
	})

	for _, network := range localNetworks {
		ip := network.ip.To4()
		mask := []byte(network.mask)
		if ip == nil || len(mask) != 4 {
			continue
		}

		t.conn.AddRule(&nftables.Rule{
			Table: mangle,
			Chain: output,
			Exprs: []expr.Any{
				&expr.Payload{
					DestRegister: 1,
					Base:         expr.PayloadBaseNetworkHeader,
					Offset:       16,
					Len:          4,
				},
				&expr.Bitwise{
					SourceRegister: 1,
					DestRegister:   1,
					Len:            4,
					Mask:           mask,
					Xor:            []byte{0, 0, 0, 0},
				},
				&expr.Cmp{
					Op:       expr.CmpOpEq,
					Register: 1,
					Data:     ip,
				},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	if routingConfig.TCP == config.RoutingModeTUN {
		t.conn.AddRule(&nftables.Rule{
			Table: mangle,
			Chain: output,
			Exprs: []expr.Any{
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte{0, 0, 0, 0}},
				&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 2},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 2, Data: []byte{unix.IPPROTO_TCP}},
				&expr.Immediate{Register: 1, Data: markData},
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1, SourceRegister: true},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	if routingConfig.UDP == config.RoutingModeTUN {
		t.conn.AddRule(&nftables.Rule{
			Table: mangle,
			Chain: output,
			Exprs: []expr.Any{
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte{0, 0, 0, 0}},
				&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 2},
				&expr.Cmp{Op: expr.CmpOpEq, Register: 2, Data: []byte{unix.IPPROTO_UDP}},
				&expr.Immediate{Register: 1, Data: markData},
				&expr.Meta{Key: expr.MetaKeyMARK, Register: 1, SourceRegister: true},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	logger.Info("TUN nftables rules created successfully")
	return nil
}

func (t *TUNService) createStandaloneRules(routingConfig config.RoutingConfig) error {
	return t.createMarkingRules(routingConfig)
}

func (t *TUNService) deleteRules() error {
	nft, err := nftables.New()
	if err != nil {
		return nil
	}

	nft.DelTable(&nftables.Table{
		Name:   "fusiontunx_tun",
		Family: nftables.TableFamilyIPv4,
	})

	if t.useOpenWrtFw {
		fw4Table := &nftables.Table{
			Family: nftables.TableFamilyINet,
			Name:   "fw4",
		}

		chains, _ := nft.ListChains()
		for _, chain := range chains {
			if chain.Table.Name == "fw4" && chain.Table.Family == nftables.TableFamilyINet {
				rules, _ := nft.GetRules(fw4Table, chain)
				for _, rule := range rules {
					userData := string(rule.UserData)
					if strings.Contains(userData, "FusionTunX TUN") {
						nft.DelRule(rule)
					}
				}
			}
		}
	}

	nft.Flush()
	return nil
}

func (t *TUNService) IsActive() bool {
	_, err := netlink.RouteList(nil, t.tunTableID)
	return err == nil
}
