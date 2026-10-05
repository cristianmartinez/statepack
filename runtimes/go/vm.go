package statepack

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"
	"unicode/utf16"
)

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }
func fail(c, s string) error   { return &Error{c, s} }

type Function func([]any) (any, error)
type Registry map[string]Function

func DefaultRegistry() Registry {
	r := Registry{}
	for _, n := range []string{"length", "abs", "floor", "ceil", "round", "min", "max", "toString"} {
		name := n
		r[n] = func(a []any) (any, error) {
			if len(a) == 0 {
				return nil, fail("TYPE_ERROR", "missing arguments")
			}
			if name != "min" && name != "max" && ((name == "round" && len(a) > 2) || (name != "round" && len(a) != 1)) {
				return nil, fail("TYPE_ERROR", "function arity")
			}
			if name == "toString" {
				return stringValue(a[0]), nil
			}
			if name == "length" {
				switch v := a[0].(type) {
				case string:
					return float64(len(utf16.Encode([]rune(v)))), nil
				case []any:
					return float64(len(v)), nil

				}
				return nil, fail("TYPE_ERROR", "length requires collection")
			}
			v, ok := a[0].(float64)
			if !ok {
				return nil, fail("TYPE_ERROR", "numeric argument required")
			}
			switch name {
			case "abs":
				return math.Abs(v), nil
			case "floor":
				return math.Floor(v), nil
			case "ceil":
				return math.Ceil(v), nil
			case "round":
				d := 0.0
				if len(a) > 1 {
					var ok bool
					d, ok = a[1].(float64)
					if !ok {
						return nil, fail("TYPE_ERROR", "numeric decimals required")
					}
				}
				p := math.Pow(10, d)
				return math.Floor(v*p+0.5) / p, nil
			case "min", "max":
				for _, x := range a[1:] {
					n, ok := x.(float64)
					if !ok {
						return nil, fail("TYPE_ERROR", "numeric argument required")
					}
					if name == "min" {
						v = math.Min(v, n)
					} else {
						v = math.Max(v, n)
					}
				}
				return v, nil
			}
			return nil, nil
		}
	}
	return r
}
func truth(v any) bool { return v != nil && v != false }
func stringValue(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return x
	case bool:
		return strconv.FormatBool(x)
	case float64:
		if x == 0 {
			return "0"
		}
		if math.Abs(x) >= 1e21 || math.Abs(x) < 1e-6 {
			v := strconv.FormatFloat(x, 'e', -1, 64)
			v = strings.ReplaceAll(v, "e-0", "e-")
			v = strings.ReplaceAll(v, "e+0", "e+")
			return v
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case []any:
		s := []string{}
		for _, a := range x {
			if a == nil {
				s = append(s, "")
			} else {
				s = append(s, stringValue(a))
			}
		}
		return strings.Join(s, ",")
	default:
		return "[object Object]"
	}
}
func obj(v any) map[string]any { m, _ := v.(map[string]any); return m }
func arr(v any) []any          { a, _ := v.([]any); return a }
func str(v any) string         { s, _ := v.(string); return s }
func index(v, k any) any {
	if s, ok := k.(string); ok {
		if s == "__proto__" || s == "constructor" || s == "prototype" {
			return nil
		}
		if m, ok := v.(map[string]any); ok {
			return m[s]
		}
		if s == "length" {
			switch x := v.(type) {
			case []any:
				return float64(len(x))
			case string:
				return float64(len(utf16.Encode([]rune(x))))
			}
		}
	}
	n, ok := k.(float64)
	if !ok || n != math.Trunc(n) {
		return nil
	}
	i := int(n)
	switch x := v.(type) {
	case []any:
		if i < 0 {
			i += len(x)
		}
		if i >= 0 && i < len(x) {
			return x[i]
		}
	case string:
		u := utf16.Encode([]rune(x))
		if i < 0 {
			i += len(u)
		}
		if i >= 0 && i < len(u) {
			return string(utf16.Decode(u[i : i+1]))
		}
	}
	return nil
}
func path(v any, p string) any {
	if p == "$" {
		return v
	}
	if strings.HasPrefix(p, "$context") || strings.HasPrefix(p, "$env") {
		return nil
	}
	p = strings.TrimPrefix(p, "$.")
	p = strings.ReplaceAll(p, "[", ".")
	p = strings.ReplaceAll(p, "]", "")
	for _, k := range strings.Split(p, ".") {
		if k == "" {
			continue
		}
		if n, e := strconv.ParseFloat(k, 64); e == nil {
			v = index(v, n)
		} else {
			v = index(v, k)
		}
	}
	return v
}
func finite(v any) bool {
	switch x := v.(type) {
	case nil, bool, string:
		return true
	case float64:
		return !math.IsNaN(x) && !math.IsInf(x, 0)
	case []any:
		for _, a := range x {
			if !finite(a) {
				return false
			}
		}
	case map[string]any:
		for k, a := range x {
			if k == "__lambda" {
				return false
			}
			if !finite(a) {
				return false
			}
		}
	default:
		return false
	}
	return true
}
func integer(v any) (int, bool) {
	n, ok := v.(float64)
	return int(n), ok && n == math.Trunc(n) && n >= 0 && n <= 10000000
}
func ValidateExpression(e any, r Registry) error {
	m := obj(e)
	p := obj(m["program"])
	if m["engine"] != "yexp" || m["artifactVersion"] != float64(1) || p["version"] != float64(1) {
		return fail("INVALID_ARTIFACT", "unsupported expression version")
	}
	slots, ok := p["slots"].([]any)
	if !ok {
		return fail("INVALID_ARTIFACT", "slots must be array")
	}
	for _, s := range slots {
		if _, ok := s.(string); !ok {
			return fail("INVALID_ARTIFACT", "slot must be string")
		}
	}
	constants, ok := p["constants"].([]any)
	if containsLambda(constants) {
		return fail("UNSUPPORTED_FEATURE", "lambda constants")
	}
	if !ok || !finite(constants) {
		return fail("INVALID_ARTIFACT", "invalid constants")
	}
	code, ok := p["code"].([]any)
	if !ok || len(code) == 0 {
		return fail("INVALID_ARTIFACT", "empty code")
	}
	for _, raw := range code {
		i := arr(raw)
		if len(i) == 0 {
			return fail("INVALID_INSTRUCTION", "empty instruction")
		}
		op, ok := integer(i[0])
		if !ok {
			return fail("INVALID_INSTRUCTION", "invalid opcode")
		}
		arity := 1
		slot := false
		switch {
		case op == 0 || op == 1 || op == 70 || op == 71 || op >= 80 && op <= 83 || op >= 91 && op <= 93 || op == 100 || op == 101 || op == 110 || op == 111 || op == 116 || op == 117:
			arity = 2
			slot = op == 1 || op == 70 || op == 71 || op >= 80 && op <= 83
		case op >= 40 && op <= 43:
			arity = 4
			slot = true
		case op >= 50 && op <= 57 || op >= 60 && op <= 64:
			arity = 3
			slot = true
		case op == 130:
			arity = 3
		case op == 2 || op == 3 || op >= 10 && op <= 15 || op == 20 || op >= 30 && op <= 37 || op == 90 || op == 200:
		default:
			return fail("UNSUPPORTED_FEATURE", fmt.Sprintf("opcode %d", op))
		}
		if len(i) != arity {
			return fail("INVALID_INSTRUCTION", "instruction arity")
		}
		if slot {
			n, ok := integer(i[1])
			if !ok || n >= len(slots) {
				return fail("INVALID_INSTRUCTION", "slot reference")
			}
		}
		if op == 0 {
			n, ok := integer(i[1])
			if !ok || n >= len(constants) {
				return fail("INVALID_INSTRUCTION", "constant reference")
			}
		}
		if op >= 91 && op <= 93 {
			n, ok := integer(i[1])
			if !ok || n >= len(code) {
				return fail("INVALID_INSTRUCTION", "jump target")
			}
		}
		if op == 100 || op == 101 || op == 130 {
			n := 1
			if op == 130 {
				n = 2
				if _, ok := r[str(i[1])]; !ok {
					return fail("UNKNOWN_FUNCTION", str(i[1]))
				}
			}
			if _, ok := integer(i[n]); !ok {
				return fail("INVALID_INSTRUCTION", "invalid count")
			}
		}
		if op >= 40 && op <= 43 {
			for _, v := range i[2:] {
				if _, ok := v.(float64); !ok {
					return fail("INVALID_INSTRUCTION", "numeric range operand")
				}
			}
		}
		if op >= 60 && op <= 64 || op >= 50 && op <= 53 {
			if _, ok := i[2].(float64); !ok {
				return fail("INVALID_INSTRUCTION", "numeric fused operand")
			}
		}
		if op == 116 {
			if _, ok := i[1].(string); !ok {
				return fail("INVALID_INSTRUCTION", "property operand")
			}
		}
		if op == 110 || op == 111 || op == 117 {
			switch v := i[1].(type) {
			case string:
			case float64:
				if v != math.Trunc(v) {
					return fail("INVALID_INSTRUCTION", "integer index")
				}
			default:
				return fail("INVALID_INSTRUCTION", "index operand")
			}
		}
		if !finite(i) {
			return fail("INVALID_INSTRUCTION", "nonfinite operand")
		}
	}
	return nil
}
func binary(op int, a, b any) (any, error) {
	if op == 30 || op == 31 || op == 36 || op == 37 {
		if reflect.TypeOf(a) == reflect.TypeOf([]any{}) || reflect.TypeOf(b) == reflect.TypeOf([]any{}) || obj(a) != nil || obj(b) != nil {
			return nil, fail("UNSUPPORTED_FEATURE", "collection equality")
		}
		eq := reflect.DeepEqual(a, b)
		if op == 31 || op == 37 {
			eq = !eq
		}
		return eq, nil
	}
	if sa, ok := a.(string); ok {
		sb, ok := b.(string)
		if !ok {
			return nil, fail("TYPE_ERROR", "matching types required")
		}
		switch op {
		case 10:
			return sa + sb, nil
		}
	}
	x, ok := a.(float64)
	y, ok2 := b.(float64)
	if !ok || !ok2 {
		return nil, fail("TYPE_ERROR", "numeric operands required")
	}
	switch op {
	case 10:
		return x + y, nil
	case 11:
		return x - y, nil
	case 12:
		return x * y, nil
	case 13, 14:
		if y == 0 {
			return nil, fail("DIVISION_BY_ZERO", "zero divisor")
		}
		if op == 13 {
			return x / y, nil
		}
		return math.Mod(x, y), nil
	case 32:
		return x < y, nil
	case 33:
		return x > y, nil
	case 34:
		return x <= y, nil
	case 35:
		return x >= y, nil
	}
	return nil, fail("INVALID_INSTRUCTION", "invalid operation")
}
func Evaluate(e, scope any, r Registry) (result any, err error) {
	defer func() {
		if x := recover(); x != nil {
			if e, ok := x.(*Error); ok {
				err = e
			} else {
				err = fail("INVALID_INSTRUCTION", "invalid stack or operand")
			}
		}
	}()
	if err = ValidateExpression(e, r); err != nil {
		return
	}
	p := obj(obj(e)["program"])
	code := arr(p["code"])
	slots := arr(p["slots"])
	constants := arr(p["constants"])
	s := []any{}
	pop := func() any { n := len(s) - 1; v := s[n]; s = s[:n]; return v }
	push := func(v any) { s = append(s, v) }
	for pc, budget := 0, 100000; pc < len(code); pc++ {
		budget--
		if budget < 0 {
			return nil, fail("LIMIT_EXCEEDED", "instruction budget")
		}
		i := arr(code[pc])
		op, _ := integer(i[0])
		load := func() any {
			n, _ := integer(i[1])
			v, e := checkedPath(scope, str(slots[n]))
			if e != nil {
				panic(e)
			}
			return v
		}
		var v any
		switch {
		case op == 0:
			n, _ := integer(i[1])
			push(constants[n])
		case op == 1:
			push(load())
		case op == 2:
			push(s[len(s)-1])
		case op == 3:
			pop()
		case op >= 10 && op <= 14 || op >= 30 && op <= 37:
			b := pop()
			a := pop()
			v, err = binary(op, a, b)
			push(v)
		case op == 15:
			a, ok := pop().(float64)
			if !ok {
				return nil, fail("TYPE_ERROR", "negation requires number")
			}
			push(-a)
		case op == 20:
			push(stringValue(pop()))
		case op >= 40 && op <= 43:
			x, ok := load().(float64)
			lo, ok2 := i[2].(float64)
			hi, ok3 := i[3].(float64)
			if !ok || !ok2 || !ok3 {
				return nil, fail("TYPE_ERROR", "range requires numbers")
			}
			l := x >= lo
			h := x <= hi
			if op == 41 || op == 43 {
				l = x > lo
			}
			if op == 41 || op == 42 {
				h = x < hi
			}
			push(l && h)
		case op >= 50 && op <= 57:
			ops := []int{33, 35, 32, 34, 30, 31, 36, 37}
			v, err = binary(ops[op-50], load(), i[2])
			push(v)
		case op >= 60 && op <= 64:
			v, err = binary(op-50, load(), i[2])
			push(v)
		case op == 70 || op == 71:
			n := 1.0
			if op == 71 {
				n = -1
			}
			v, err = binary(10, load(), n)
			push(v)
		case op >= 80 && op <= 83:
			v := load()
			switch op {
			case 80:
				push(v == nil)
			case 81:
				push(v != nil)
			case 82:
				push(truth(v))
			case 83:
				push(!truth(v))
			}
		case op == 90:
			push(!truth(pop()))
		case op == 91 || op == 92:
			yes := truth(pop())
			if yes == (op == 92) {
				n, _ := integer(i[1])
				pc = n - 1
			}
		case op == 93:
			n, _ := integer(i[1])
			pc = n - 1
		case op == 100:
			n, _ := integer(i[1])
			a := append([]any{}, s[len(s)-n:]...)
			s = s[:len(s)-n]
			push(a)
		case op == 101:
			n, _ := integer(i[1])
			m := map[string]any{}
			a := s[len(s)-n*2:]
			for j := 0; j < len(a); j += 2 {
				k, ok := a[j].(string)
				if !ok {
					return nil, fail("TYPE_ERROR", "object key must be string")
				}
				if k != "__proto__" && k != "constructor" && k != "prototype" {
					m[k] = a[j+1]
				}
			}
			s = s[:len(s)-n*2]
			push(m)
		case op == 110 || op == 111 || op == 116 || op == 117:
			k := i[1]
			if k == float64(-1) {
				k = pop()
			}
			a := pop()
			if a == nil && op == 110 {
				return nil, fail("TYPE_ERROR", "index null")
			}
			if x, ok := a.(string); ok {
				if n, ok := k.(float64); ok {
					u := utf16.Encode([]rune(x))
					ix := int(n)
					if ix < 0 {
						ix += len(u)
					}
					if ix >= 0 && ix < len(u) && u[ix] >= 0xD800 && u[ix] <= 0xDFFF {
						return nil, fail("UNSUPPORTED_FEATURE", "isolated surrogate index")
					}
				}
			}
			push(index(a, k))
		case op == 130:
			n, _ := integer(i[2])
			a := append([]any{}, s[len(s)-n:]...)
			s = s[:len(s)-n]
			v, err = r[str(i[1])](a)
			if err == nil && !finite(v) {
				return nil, fail("TYPE_ERROR", "callback must return finite JSON")
			}
			push(v)
		case op == 200:
			if len(s) != 1 {
				return nil, fail("INVALID_INSTRUCTION", "return stack")
			}
			if !finite(s[0]) {
				return nil, fail("TYPE_ERROR", "nonfinite result")
			}
			return s[0], nil
		}
		if err != nil {
			return nil, err
		}
		if len(s) > 100000 {
			return nil, fail("LIMIT_EXCEEDED", "stack budget")
		}
	}
	return nil, fail("INVALID_INSTRUCTION", "missing return")
}
func Decode(b []byte) (any, error) { var v any; err := json.Unmarshal(b, &v); return v, err }

func compareUTF16(a, b string) int {
	x, y := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] < y[i] {
			return -1
		}
		if x[i] > y[i] {
			return 1
		}
	}
	if len(x) < len(y) {
		return -1
	}
	if len(x) > len(y) {
		return 1
	}
	return 0
}

func checkedPath(v any, p string) (any, error) {
	if p == "$" {
		return v, nil
	}
	if strings.HasPrefix(p, "$context") || strings.HasPrefix(p, "$env") {
		return nil, nil
	}
	p = strings.TrimPrefix(p, "$.")
	p = strings.ReplaceAll(p, "[", ".")
	p = strings.ReplaceAll(p, "]", "")
	for _, k := range strings.Split(p, ".") {
		if k == "" {
			continue
		}
		if n, e := strconv.ParseFloat(k, 64); e == nil {
			if s, ok := v.(string); ok {
				u := utf16.Encode([]rune(s))
				i := int(n)
				if i < 0 {
					i += len(u)
				}
				if i >= 0 && i < len(u) && u[i] >= 0xD800 && u[i] <= 0xDFFF {
					return nil, fail("UNSUPPORTED_FEATURE", "isolated surrogate index")
				}
			}
			v = index(v, n)
		} else {
			v = index(v, k)
		}
	}
	return v, nil
}

func containsLambda(v any) bool {
	switch x := v.(type) {
	case map[string]any:
		if x["__lambda"] == true {
			return true
		}
		for _, v := range x {
			if containsLambda(v) {
				return true
			}
		}
	case []any:
		for _, v := range x {
			if containsLambda(v) {
				return true
			}
		}
	}
	return false
}
