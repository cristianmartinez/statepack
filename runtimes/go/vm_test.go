package statepack

import (
	"encoding/json"
	"os"
	"testing"
)

func expression(code string, slots string, constants string) any {
	v, e := Decode([]byte(`{"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":` + slots + `,"constants":` + constants + `,"code":` + code + `}}`))
	if e != nil {
		panic(e)
	}
	return v
}
func TestVM(t *testing.T) {
	cases := []struct {
		code string
		want any
	}{{`[[0,0],[0,1],[10],[200]]`, float64(5)}, {`[[0,0],[0,1],[32],[200]]`, true}, {`[[0,0],[90],[200]]`, false}, {`[[0,0],[130,"double",1],[200]]`, float64(4)}}
	r := DefaultRegistry()
	r["double"] = func(a []any) (any, error) { return binary(12, a[0], float64(2)) }
	for _, c := range cases {
		v, e := Evaluate(expression(c.code, `[]`, `[2,3]`), nil, r)
		if e != nil || v != c.want {
			t.Fatalf("%s: %v %v", c.code, v, e)
		}
	}
}
func TestInvalid(t *testing.T) {
	for _, code := range []string{`[[0,99],[200]]`, `[[93,99]]`, `[[10],[200]]`, `[[999]]`, `[[130,"network",0],[200]]`} {
		_, e := Evaluate(expression(code, `[]`, `[]`), nil, DefaultRegistry())
		if e == nil {
			t.Fatal("expected error", code)
		}
	}
}
func TestCounter(t *testing.T) {
	b, e := os.ReadFile("../../docs/examples/compiled-counter.json")
	if e != nil {
		t.Fatal(e)
	}
	v, _ := Decode(b)
	m, e := LoadMachine(v, DefaultRegistry())
	if e != nil {
		t.Fatal(e)
	}
	if e = m.Start(); e != nil {
		t.Fatal(e)
	}
	if e = m.Send(map[string]any{"type": "INCREMENT", "amount": float64(3)}); e != nil {
		t.Fatal(e)
	}
	if obj(m.Store["counter"])["count"] != float64(3) || obj(m.Queries["counter"])["doubled"] != float64(6) {
		t.Fatal(m.Snapshot())
	}
	b, _ = json.Marshal(m.Snapshot())
	if len(b) == 0 {
		t.Fatal("snapshot")
	}
}
func TestBudget(t *testing.T) {
	_, e := Evaluate(expression(`[[93,0]]`, `[]`, `[]`), nil, DefaultRegistry())
	if e == nil || e.(*Error).Code != "LIMIT_EXCEEDED" {
		t.Fatal(e)
	}
}
func TestCallbackFinite(t *testing.T) {
	r := DefaultRegistry()
	r["custom"] = func(a []any) (any, error) { return map[string]any{"ok": true}, nil }
	v, e := Evaluate(expression(`[[130,"custom",0],[200]]`, `[]`, `[]`), nil, r)
	if e != nil || obj(v)["ok"] != true {
		t.Fatal(v, e)
	}
}

func TestStaticSurrogatePath(t *testing.T) {
	_, e := Evaluate(expression(`[[1,0],[200]]`, `["$.text[0]"]`, `[]`), map[string]any{"text": "😀"}, DefaultRegistry())
	if e == nil || e.(*Error).Code != "UNSUPPORTED_FEATURE" {
		t.Fatal(e)
	}
}

func TestLambdaRejected(t *testing.T) {
	_, e := Evaluate(expression(`[[0,0],[200]]`, `[]`, `[{"nested":{"__lambda":true}}]`), nil, DefaultRegistry())
	if e == nil || e.(*Error).Code != "UNSUPPORTED_FEATURE" {
		t.Fatal(e)
	}
}
func TestGuardScalarCoercion(t *testing.T) {
	for _, right := range []any{"2", true, nil} {
		b, e := cond(map[string]any{"type": "compare", "op": ">", "left": float64(3), "right": right}, nil)
		if e != nil || !b {
			t.Fatal(right, b, e)
		}
	}
}
func TestScopeSliceOrder(t *testing.T) {
	m := &Machine{SliceOrder: []string{"one", "two"}, Store: map[string]any{"one": map[string]any{"count": float64(1), "override": float64(1)}, "two": map[string]any{"count": float64(2), "override": float64(2)}}, Queries: map[string]any{"one": map[string]any{"override": float64(3)}, "two": map[string]any{}}}
	for i := 0; i < 100; i++ {
		s := obj(obj(m.scope(nil))["context"])
		if s["count"] != float64(2) || s["override"] != float64(3) {
			t.Fatal(s)
		}
	}
}
func TestLoadRejectsIgnoredExecutableFields(t *testing.T) {
	b, _ := os.ReadFile("../../docs/examples/compiled-counter.json")
	for _, mode := range []string{"on", "named"} {
		a, _ := Decode(b)
		d := obj(obj(a)["definition"])
		if mode == "on" {
			obj(obj(d["states"])["active"])["on"] = []any{}
		} else {
			d["actions"] = map[string]any{"unused": map[string]any{"type": "invoke"}}
		}
		_, e := LoadMachine(a, DefaultRegistry())
		if e == nil {
			t.Fatal(mode, "accepted")
		}
	}
}
