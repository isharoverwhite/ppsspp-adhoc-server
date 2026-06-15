package protocol

import (
	"bytes"
	"encoding/binary"
	"io"
)

const (
	OpcodePing           uint8 = 0x00
	OpcodeLogin          uint8 = 0x01
	OpcodeConnect        uint8 = 0x02
	OpcodeDisconnect     uint8 = 0x03
	OpcodeScan           uint8 = 0x04
	OpcodeScanComplete   uint8 = 0x05
	OpcodeConnectBSSID   uint8 = 0x06
	OpcodeChat           uint8 = 0x07
)

type MAC [6]byte
type Nickname [128]byte
type ProductCode [9]byte
type GroupName [8]byte
type ChatMessage [64]byte

// C2S Packets

type LoginPacketC2S struct {
	Opcode  uint8
	MAC     MAC
	Name    Nickname
	Game    ProductCode
}

func (p *LoginPacketC2S) Decode(r io.Reader) error {
	return binary.Read(r, binary.LittleEndian, p)
}

type ConnectPacketC2S struct {
	Opcode uint8
	Group  GroupName
}

func (p *ConnectPacketC2S) Decode(r io.Reader) error {
	return binary.Read(r, binary.LittleEndian, p)
}

type ChatPacketC2S struct {
	Opcode  uint8
	Message ChatMessage
}

func (p *ChatPacketC2S) Decode(r io.Reader) error {
	return binary.Read(r, binary.LittleEndian, p)
}

// S2C Packets

type ConnectPacketS2C struct {
	Opcode uint8
	Name   Nickname
	MAC    MAC
	IP     uint32
}

func (p *ConnectPacketS2C) Encode() []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, p)
	return buf.Bytes()
}

type DisconnectPacketS2C struct {
	Opcode uint8
	IP     uint32
}

func (p *DisconnectPacketS2C) Encode() []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, p)
	return buf.Bytes()
}

type ScanPacketS2C struct {
	Opcode uint8
	Group  GroupName
	MAC    MAC
}

func (p *ScanPacketS2C) Encode() []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, p)
	return buf.Bytes()
}

type ConnectBSSIDPacketS2C struct {
	Opcode uint8
	MAC    MAC
}

func (p *ConnectBSSIDPacketS2C) Encode() []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, p)
	return buf.Bytes()
}

type ChatPacketS2C struct {
	Opcode  uint8
	Message ChatMessage
	Name    Nickname
}

func (p *ChatPacketS2C) Encode() []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, p)
	return buf.Bytes()
}

// Helpers

func CString(b []byte) string {
	n := bytes.IndexByte(b, 0)
	if n == -1 {
		return string(b)
	}
	return string(b[:n])
}
