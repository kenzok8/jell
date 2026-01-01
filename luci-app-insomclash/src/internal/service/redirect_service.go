package service

import (
	"fmt"

	"fusiontunx/pkg/logger"

	"github.com/sagernet/nftables"
	"github.com/sagernet/nftables/expr"
	"golang.org/x/sys/unix"
)

type RedirectService struct {
	conn         *nftables.Conn
	redirectPort uint16
	mihomoMark   uint32
}

func NewRedirectService() *RedirectService {
	return &RedirectService{
		redirectPort: 7891,
		mihomoMark:   0x100,
	}
}

func (rs *RedirectService) Setup(conn *nftables.Conn) error {
	rs.conn = conn

	if err := rs.createRules(); err != nil {
		return fmt.Errorf("failed to create REDIRECT rules: %w", err)
	}

	logger.Info("REDIRECT setup successful")
	return nil
}

func (rs *RedirectService) Cleanup(conn *nftables.Conn) error {
	if conn != nil {
		rs.deleteRules(conn)
	}
	logger.Info("REDIRECT cleanup successful")
	return nil
}

func (rs *RedirectService) createRules() error {
	logger.Debug("REDIRECT: Creating table")
	table := rs.conn.AddTable(&nftables.Table{
		Family: nftables.TableFamilyINet,
		Name:   "fusiontunx_redirect",
	})

	outputChain := rs.conn.AddChain(&nftables.Chain{
		Name:     "nat_output",
		Table:    table,
		Type:     nftables.ChainTypeNAT,
		Hooknum:  nftables.ChainHookOutput,
		Priority: nftables.ChainPriorityRef(-100),
	})

	rs.addOutputRules(table, outputChain)

	logger.Info("REDIRECT nftables rules created successfully")
	return nil
}

func (rs *RedirectService) addOutputRules(table *nftables.Table, chain *nftables.Chain) {
	mihomoMarkData := []byte{0x00, 0x01, 0x00, 0x00}

	rs.conn.AddRule(&nftables.Rule{
		Table: table,
		Chain: chain,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyOIFNAME, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte("lo\x00")},
			&expr.Verdict{Kind: expr.VerdictAccept},
		},
	})

	rs.conn.AddRule(&nftables.Rule{
		Table: table,
		Chain: chain,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyMARK, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: mihomoMarkData},
			&expr.Counter{},
			&expr.Verdict{Kind: expr.VerdictReturn},
		},
	})

	localNetworks := []struct {
		ip   []byte
		mask []byte
	}{
		{ip: []byte{127, 0, 0, 0}, mask: []byte{255, 0, 0, 0}},
		{ip: []byte{10, 0, 0, 0}, mask: []byte{255, 0, 0, 0}},
		{ip: []byte{172, 16, 0, 0}, mask: []byte{255, 240, 0, 0}},
		{ip: []byte{192, 168, 0, 0}, mask: []byte{255, 255, 0, 0}},
	}

	for _, network := range localNetworks {
		rs.conn.AddRule(&nftables.Rule{
			Table: table,
			Chain: chain,
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
					Mask:           network.mask,
					Xor:            []byte{0, 0, 0, 0},
				},
				&expr.Cmp{
					Op:       expr.CmpOpEq,
					Register: 1,
					Data:     network.ip,
				},
				&expr.Verdict{Kind: expr.VerdictAccept},
			},
		})
	}

	portData := []byte{byte(rs.redirectPort >> 8), byte(rs.redirectPort & 0xFF)}
	rs.conn.AddRule(&nftables.Rule{
		Table: table,
		Chain: chain,
		Exprs: []expr.Any{
			&expr.Meta{Key: expr.MetaKeyL4PROTO, Register: 1},
			&expr.Cmp{Op: expr.CmpOpEq, Register: 1, Data: []byte{unix.IPPROTO_TCP}},
			&expr.Counter{},
			&expr.Immediate{Register: 2, Data: portData},
			&expr.Redir{RegisterProtoMin: 2},
		},
	})
}

func (rs *RedirectService) deleteRules(conn *nftables.Conn) {
	table := &nftables.Table{
		Family: nftables.TableFamilyINet,
		Name:   "fusiontunx_redirect",
	}
	conn.DelTable(table)
	conn.Flush()
}
