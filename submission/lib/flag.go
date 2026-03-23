package lib

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/sha3"
)

const (
	MacLen  = 10
	DataLen = 14 // 8 (timestamp) + 4 (flag_id) + 2 (team_net_no)
)

var XorString = []byte("CTF-GAMESERVER")

// Định nghĩa các lỗi (Exceptions) tương đương Python
var (
	ErrInvalidFlagFormat = errors.New("invalid flag format")
	ErrInvalidFlagMAC    = errors.New("invalid flag MAC")
)

// ErrFlagExpired là lỗi custom chứa thông tin thời gian hết hạn
type ErrFlagExpired struct {
	ExpirationTime time.Time
}

func (e *ErrFlagExpired) Error() string {
	return fmt.Sprintf("Flag expired since %s", e.ExpirationTime.Format(time.RFC3339))
}

// NowFunc cho phép dễ dàng mock thời gian khi viết Unit Test (tương đương _now() trong Python)
var NowFunc = func() time.Time {
	return time.Now().UTC()
}

// Generate tạo một flag đã được bảo vệ bằng MAC.
func Generate(expirationTime time.Time, flagID uint32, teamNetNo uint16, secret []byte, prefix string) string {
	buf := make([]byte, DataLen)

	// Struct packing (Big Endian) '! Q I H'
	binary.BigEndian.PutUint64(buf[0:8], uint64(expirationTime.Unix()))
	binary.BigEndian.PutUint32(buf[8:12], flagID)
	binary.BigEndian.PutUint16(buf[12:14], teamNetNo)

	// XOR
	protectedData := make([]byte, DataLen)
	for i := 0; i < DataLen; i++ {
		protectedData[i] = buf[i] ^ XorString[i]
	}

	mac := genMAC(secret, protectedData)

	// Nối chuỗi: protected_data + mac
	finalData := append(protectedData, mac...)

	return prefix + base64.StdEncoding.EncodeToString(finalData)
}

// Verify xác thực cờ và trả về (flagID, teamNetNo, error).
func Verify(flag string, secret []byte, prefix string) (uint32, uint16, error) {
	if !strings.HasPrefix(flag, prefix) {
		return 0, 0, ErrInvalidFlagFormat
	}

	encodedStr := flag[len(prefix):]
	rawFlag, err := base64.StdEncoding.DecodeString(encodedStr)
	if err != nil {
		return 0, 0, ErrInvalidFlagFormat
	}

	// Xác minh độ dài dữ liệu để tránh panic slice out-of-bounds
	if len(rawFlag) != DataLen+MacLen {
		return 0, 0, ErrInvalidFlagFormat
	}

	protectedData := rawFlag[:DataLen]
	flagMAC := rawFlag[DataLen:]

	expectedMAC := genMAC(secret, protectedData)

	// Constant-time compare để chống Timing Attack
	if subtle.ConstantTimeCompare(expectedMAC, flagMAC) != 1 {
		return 0, 0, ErrInvalidFlagMAC
	}

	// Giải mã XOR
	unXored := make([]byte, DataLen)
	for i := 0; i < DataLen; i++ {
		unXored[i] = protectedData[i] ^ XorString[i]
	}

	// Struct unpacking
	expTimestamp := binary.BigEndian.Uint64(unXored[0:8])
	flagID := binary.BigEndian.Uint32(unXored[8:12])
	teamNetNo := binary.BigEndian.Uint16(unXored[12:14])

	expTime := time.Unix(int64(expTimestamp), 0).UTC()
	if expTime.Before(NowFunc()) {
		return 0, 0, &ErrFlagExpired{ExpirationTime: expTime}
	}

	return flagID, teamNetNo, nil
}

// genMAC sử dụng thuật toán Keccak (SHA3-256)
func genMAC(secret []byte, protectedData []byte) []byte {
	h := sha3.New256()
	h.Write(secret)
	h.Write(protectedData)
	fullDigest := h.Sum(nil)

	return fullDigest[:MacLen]
}
