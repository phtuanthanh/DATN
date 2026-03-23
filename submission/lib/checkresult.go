package lib

import "fmt"

const StatusTimeout = 5

type CheckResult int

const (
	OK             CheckResult = 0
	DOWN           CheckResult = 1 
	FAULTY         CheckResult = 2
	FlagNotFound   CheckResult = 3
	Recovering     CheckResult = 4
	Timeout        CheckResult = 5
)

// Hàm String() tương đương với __str__ trong Python
// Giúp khi in ra (fmt.Print) sẽ hiện tên thay vì số
func (r CheckResult) String() string {
	switch r {
	case OK:
		return "OK"
	case DOWN:
		return "DOWN"
	case FAULTY:
		return "FAULTY"
	case FlagNotFound:
		return "FLAG_NOT_FOUND"
	case Recovering:
		return "RECOVERING"
	case Timeout:
		return "TIMEOUT"
	default:
		return fmt.Sprintf("UNKNOWN(%d)", r)
	}
}