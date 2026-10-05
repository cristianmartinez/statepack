package statepack

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
)

type Machine struct {
	Definition     map[string]any
	Registry       Registry
	State          string
	Done           bool
	Store, Queries map[string]any
	Effects        []any
	Expressions    map[string]any
	Slices         map[string]map[string]any
	SliceOrder     []string
	budget         int
}

func copyJSON(v any) any { b, _ := json.Marshal(v); x, _ := Decode(b); return x }
func list(v any) []any {
	if v == nil {
		return nil
	}
	if a, ok := v.([]any); ok {
		return a
	}
	return []any{v}
}
func allowed(m map[string]any, keys string) error {
	for k := range m {
		if !strings.Contains(" "+keys+" ", " "+k+" ") {
			return fail("UNSUPPORTED_FEATURE", "field "+k)
		}
	}
	return nil
}
func table(v any, r Registry) (map[string]any, error) {
	a, ok := v.([]any)
	if !ok {
		return nil, fail("INVALID_ARTIFACT", "expression table required")
	}
	m := map[string]any{}
	for _, p := range a {
		x := arr(p)
		if len(x) != 2 || str(x[0]) == "" {
			return nil, fail("INVALID_ARTIFACT", "expression pair")
		}
		k := str(x[0])
		if m[k] != nil {
			return nil, fail("INVALID_ARTIFACT", "duplicate expression")
		}
		if e := ValidateExpression(x[1], r); e != nil {
			return nil, e
		}
		m[k] = x[1]
	}
	return m, nil
}
func LoadMachine(a any, r Registry) (*Machine, error) {
	x := obj(a)
	d := obj(x["definition"])
	if x["format"] != "statepack.compiled" || x["version"] != float64(1) || d["expressionEngine"] != "yexp" {
		return nil, fail("INVALID_ARTIFACT", "version or engine")
	}
	if e := allowed(d, "id initial states store on actions guards expressionEngine context meta"); e != nil {
		return nil, e
	}
	m := &Machine{Definition: d, Registry: r, Store: map[string]any{}, Queries: map[string]any{}, Effects: []any{}, Slices: map[string]map[string]any{}, budget: 1000}
	var e error
	m.Expressions, e = table(x["expressions"], r)
	if e != nil {
		return nil, e
	}
	aSlices, ok := x["slices"].([]any)
	if !ok {
		return nil, fail("INVALID_ARTIFACT", "slices required")
	}
	for _, s := range aSlices {
		z := obj(s)
		n := str(z["name"])
		if n == "" || m.Slices[n] != nil {
			return nil, fail("INVALID_ARTIFACT", "duplicate slice")
		}
		m.SliceOrder = append(m.SliceOrder, n)
		m.Slices[n], e = table(z["expressions"], r)
		if e != nil {
			return nil, e
		}
	}
	store := obj(d["store"])
	if len(store) != len(m.Slices) {
		return nil, fail("INVALID_ARTIFACT", "slice mismatch")
	}
	for n, s := range store {
		z := obj(s)
		if m.Slices[n] == nil || obj(z["context"]) == nil {
			return nil, fail("INVALID_ARTIFACT", "slice context")
		}
		if e := allowed(z, "context queries mutations meta"); e != nil {
			return nil, e
		}
		m.Store[n] = copyJSON(z["context"])
		m.Queries[n] = map[string]any{}
		for _, id := range obj(z["queries"]) {
			if m.Slices[n][str(id)] == nil {
				return nil, fail("INVALID_ARTIFACT", "missing query expression")
			}
		}
		for _, fields := range obj(z["mutations"]) {
			if obj(fields) == nil {
				return nil, fail("INVALID_ARTIFACT", "mutation object")
			}
			for _, id := range obj(fields) {
				if m.Slices[n][str(id)] == nil {
					return nil, fail("INVALID_ARTIFACT", "missing mutation expression")
				}
			}
		}
	}
	states := obj(d["states"])
	if states[str(d["initial"])] == nil {
		return nil, fail("INVALID_ARTIFACT", "initial state")
	}
	for _, s := range states {
		z := obj(s)
		if z == nil {
			return nil, fail("INVALID_ARTIFACT", "state object required")
		}
		if z["on"] != nil && obj(z["on"]) == nil {
			return nil, fail("INVALID_ARTIFACT", "state on must be object")
		}
		if e := allowed(z, "type entry exit on always tags description meta"); e != nil {
			return nil, e
		}
		if t := str(z["type"]); t != "" && t != "atomic" && t != "final" {
			return nil, fail("UNSUPPORTED_FEATURE", "state type")
		}
		for _, k := range []string{"entry", "exit"} {
			if e := m.validateActions(z[k], map[string]bool{}); e != nil {
				return nil, e
			}
		}
		if e := m.validateTransitions(z["always"]); e != nil {
			return nil, e
		}
		for _, t := range obj(z["on"]) {
			if e := m.validateTransitions(t); e != nil {
				return nil, e
			}
		}
	}
	if d["on"] != nil && obj(d["on"]) == nil {
		return nil, fail("INVALID_ARTIFACT", "root on must be object")
	}
	if d["actions"] != nil && obj(d["actions"]) == nil {
		return nil, fail("INVALID_ARTIFACT", "named actions must be object")
	}
	for name := range obj(d["actions"]) {
		if e := m.validateActions(name, map[string]bool{}); e != nil {
			return nil, e
		}
	}
	for _, t := range obj(d["on"]) {
		if e := m.validateTransitions(t); e != nil {
			return nil, e
		}
	}
	return m, nil
}
func (m *Machine) mutation(name string) (string, map[string]any, error) {
	p := strings.SplitN(name, ".", 2)
	if len(p) == 1 {
		if len(m.Store) != 1 {
			return "", nil, fail("INVALID_ARTIFACT", "slice prefix required")
		}
		for n := range m.Store {
			p = []string{n, name}
		}
	}
	fields := obj(obj(obj(obj(m.Definition["store"])[p[0]])["mutations"])[p[1]])
	if fields == nil {
		return "", nil, fail("INVALID_ARTIFACT", "unknown mutation")
	}
	return p[0], fields, nil
}
func (m *Machine) validateActions(v any, seen map[string]bool) error {
	for _, a := range list(v) {
		if n, ok := a.(string); ok {
			if seen[n] {
				return fail("LIMIT_EXCEEDED", "action cycle")
			}
			x := obj(m.Definition["actions"])[n]
			if x == nil {
				return fail("INVALID_ARTIFACT", "unknown action")
			}
			seen[n] = true
			e := m.validateActions(x, seen)
			delete(seen, n)
			if e != nil {
				return e
			}
			continue
		}
		x := obj(a)
		switch x["type"] {
		case "mutation":
			if _, _, e := m.mutation(str(x["name"])); e != nil {
				return e
			}
			if e := allowed(x, "type name payload"); e != nil {
				return e
			}
		case "log", "host.event":
			if x["condition"] != nil {
				return fail("UNSUPPORTED_FEATURE", "effect condition")
			}
			if e := m.checkValues(x); e != nil {
				return e
			}
		default:
			return fail("UNSUPPORTED_FEATURE", "action type")
		}
	}
	return nil
}
func (m *Machine) checkValues(v any) error {
	switch x := v.(type) {
	case string:
		if strings.HasPrefix(x, "expr:") && m.Expressions[x] == nil {
			return fail("INVALID_ARTIFACT", "missing expression")
		}
	case map[string]any:
		for _, v := range x {
			if e := m.checkValues(v); e != nil {
				return e
			}
		}
	case []any:
		for _, v := range x {
			if e := m.checkValues(v); e != nil {
				return e
			}
		}
	}
	return nil
}
func (m *Machine) validateTransitions(v any) error {
	for _, t := range list(v) {
		if s, ok := t.(string); ok {
			t = map[string]any{"target": s}
		}
		x := obj(t)
		if x == nil {
			return fail("INVALID_ARTIFACT", "transition required")
		}
		if e := allowed(x, "target actions guard internal description meta"); e != nil {
			return e
		}
		if x["target"] != nil && obj(m.Definition["states"])[str(x["target"])] == nil {
			return fail("INVALID_ARTIFACT", "target state")
		}
		if e := m.checkGuard(x["guard"], 0); e != nil {
			return e
		}
		if e := m.validateActions(x["actions"], map[string]bool{}); e != nil {
			return e
		}
	}
	return nil
}
func (m *Machine) checkGuard(g any, n int) error {
	if g == nil {
		return nil
	}
	if n > 100 {
		return fail("LIMIT_EXCEEDED", "guard cycle")
	}
	if s, ok := g.(string); ok {
		x := obj(m.Definition["guards"])[s]
		if x == nil {
			return fail("INVALID_ARTIFACT", "guard reference")
		}
		return m.checkGuard(x, n+1)
	}
	x := obj(g)
	if len(x) != 1 {
		return fail("UNSUPPORTED_FEATURE", "guard shape")
	}
	for k, v := range x {
		switch k {
		case "condition":
			return checkCondition(v)
		case "and", "or":
			for _, a := range arr(v) {
				if e := m.checkGuard(a, n+1); e != nil {
					return e
				}
			}
			return nil
		case "not":
			return m.checkGuard(v, n+1)
		}
	}
	return fail("UNSUPPORTED_FEATURE", "guard")
}
func checkCondition(v any) error {
	switch v.(type) {
	case bool, string:
		return nil
	}
	x := obj(v)
	switch x["type"] {
	case "truthy", "literal":
		return nil
	case "compare":
		for _, k := range []string{"left", "right"} {
			z := obj(x[k])
			if z != nil && z["type"] != "ref" && z["type"] != "literal" {
				return fail("UNSUPPORTED_FEATURE", "operand")
			}
		}
		if !strings.Contains(" == != === !== < > <= >= ", " "+str(x["op"])+" ") {
			return fail("UNSUPPORTED_FEATURE", "comparison")
		}
		return nil
	case "and", "or":
		for _, a := range arr(x["conditions"]) {
			if e := checkCondition(a); e != nil {
				return e
			}
		}
		return nil
	case "not":
		return checkCondition(x["condition"])
	}
	return fail("UNSUPPORTED_FEATURE", "condition")
}
func jsTruth(v any) bool {
	if v == nil || v == false || v == float64(0) || v == "" {
		return false
	}
	return true
}
func cond(v, scope any) (bool, error) {
	switch x := v.(type) {
	case bool:
		return x, nil
	case string:
		return jsTruth(path(scope, x)), nil
	}
	x := obj(v)
	switch x["type"] {
	case "literal":
		return jsTruth(x["value"]), nil
	case "truthy":
		return jsTruth(path(scope, str(x["path"]))), nil
	case "not":
		b, e := cond(x["condition"], scope)
		return !b, e
	case "and", "or":
		and := x["type"] == "and"
		for _, a := range arr(x["conditions"]) {
			b, e := cond(a, scope)
			if e != nil {
				return false, e
			}
			if b != and {
				return b, nil
			}
		}
		return and, nil
	case "compare":
		operand := func(v any) any {
			z := obj(v)
			if z["type"] == "ref" {
				return path(scope, str(z["path"]))
			}
			if z["type"] == "literal" {
				return z["value"]
			}
			return v
		}
		ops := map[string]int{"==": 30, "!=": 31, "===": 36, "!==": 37, "<": 32, ">": 33, "<=": 34, ">=": 35}
		left, right := operand(x["left"]), operand(x["right"])
		op := str(x["op"])
		if (op == "==" || op == "!=") && left != nil && right != nil && obj(left) == nil && obj(right) == nil && arr(left) == nil && arr(right) == nil {
			if _, ok := left.(bool); ok {
				left = scalarNumber(left)
			}
			if _, ok := right.(bool); ok {
				right = scalarNumber(right)
			}
			if _, ok := left.(float64); ok {
				if _, ok := right.(string); ok {
					right = scalarNumber(right)
				}
			}
			if _, ok := right.(float64); ok {
				if _, ok := left.(string); ok {
					left = scalarNumber(left)
				}
			}
		}
		if a, ok := left.(string); ok {
			if b, ok := right.(string); ok {
				c := compareUTF16(a, b)
				switch op {
				case "<":
					return c < 0, nil
				case ">":
					return c > 0, nil
				case "<=":
					return c <= 0, nil
				case ">=":
					return c >= 0, nil
				}
			}
		}
		if op == "<" || op == ">" || op == "<=" || op == ">=" {
			if obj(left) != nil || obj(right) != nil || arr(left) != nil || arr(right) != nil {
				return false, fail("UNSUPPORTED_FEATURE", "collection comparison")
			}
			left = scalarNumber(left)
			right = scalarNumber(right)
		}
		v, e := binary(ops[op], left, right)
		return v == true, e
	}
	return false, fail("INVALID_ARTIFACT", "condition")
}
func (m *Machine) scope(event any) any {
	c := map[string]any{}
	for _, n := range m.SliceOrder {
		for k, v := range obj(m.Store[n]) {
			c[k] = v
		}
	}
	for _, n := range m.SliceOrder {
		for k, v := range obj(m.Queries[n]) {
			c[k] = v
		}
	}
	return map[string]any{"context": c, "event": event}
}
func (m *Machine) guard(g, event any) (bool, error) {
	if g == nil {
		return true, nil
	}
	if s, ok := g.(string); ok {
		return m.guard(obj(m.Definition["guards"])[s], event)
	}
	x := obj(g)
	if c, ok := x["condition"]; ok {
		return cond(c, m.scope(event))
	}
	if c, ok := x["not"]; ok {
		b, e := m.guard(c, event)
		return !b, e
	}
	for _, k := range []string{"and", "or"} {
		if a, ok := x[k]; ok {
			and := k == "and"
			for _, c := range arr(a) {
				b, e := m.guard(c, event)
				if e != nil {
					return false, e
				}
				if b != and {
					return b, nil
				}
			}
			return and, nil
		}
	}
	return false, nil
}
func (m *Machine) recompute(event any) error {
	for _, n := range m.SliceOrder {
		s := obj(m.Definition["store"])[n]
		qs := obj(obj(s)["queries"])
		values := map[string]any{}
		vis := map[string]bool{}
		var calc func(string) error
		calc = func(k string) error {
			if _, ok := values[k]; ok {
				return nil
			}
			if vis[k] {
				return fail("INVALID_ARTIFACT", "query cycle")
			}
			vis[k] = true
			e := m.Slices[n][str(qs[k])]
			for _, slot := range arr(obj(obj(e)["program"])["slots"]) {
				for dep := range qs {
					if pathDependency(str(slot), "$.context."+dep) || pathDependency(str(slot), "$.queries."+dep) {
						if e := calc(dep); e != nil {
							return e
						}
					}
				}
			}
			c := obj(copyJSON(m.Store[n]))
			for k, v := range values {
				c[k] = v
			}
			v, err := Evaluate(e, map[string]any{"context": c, "queries": values, "event": event, "$root": m.Store, "$context": m.Store}, m.Registry)
			if err != nil {
				return err
			}
			values[k] = v
			delete(vis, k)
			return nil
		}
		keys := []string{}
		for k := range qs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if e := calc(k); e != nil {
				return e
			}
		}
		m.Queries[n] = values
	}
	return nil
}
func (m *Machine) resolve(v, event any) (any, error) {
	switch x := v.(type) {
	case string:
		if e := m.Expressions[x]; e != nil {
			return Evaluate(e, m.scope(event), m.Registry)
		}
	case map[string]any:
		a := map[string]any{}
		for k, v := range x {
			r, e := m.resolve(v, event)
			if e != nil {
				return nil, e
			}
			a[k] = r
		}
		return a, nil
	case []any:
		a := []any{}
		for _, v := range x {
			r, e := m.resolve(v, event)
			if e != nil {
				return nil, e
			}
			a = append(a, r)
		}
		return a, nil
	}
	return v, nil
}
func (m *Machine) actions(v, event any, depth int) error {
	if depth > 100 {
		return fail("LIMIT_EXCEEDED", "action cycle")
	}
	for _, a := range list(v) {
		if n, ok := a.(string); ok {
			if e := m.actions(obj(m.Definition["actions"])[n], event, depth+1); e != nil {
				return e
			}
			continue
		}
		x := obj(a)
		if x["type"] == "mutation" {
			n, fields, e := m.mutation(str(x["name"]))
			if e != nil {
				return e
			}
			ev := obj(copyJSON(event))
			if ev == nil {
				ev = map[string]any{}
			}
			for k, v := range obj(x["payload"]) {
				ev[k] = v
			}
			c := obj(copyJSON(m.Store[n]))
			for k, v := range obj(m.Queries[n]) {
				c[k] = v
			}
			scope := map[string]any{"context": c, "event": ev, "queries": m.Queries[n], "$root": m.Store, "$context": m.Store}
			updates := map[string]any{}
			for k, id := range fields {
				v, e := Evaluate(m.Slices[n][str(id)], scope, m.Registry)
				if e != nil {
					return e
				}
				updates[k] = v
			}
			for k, v := range updates {
				obj(m.Store[n])[k] = v
			}
			if e := m.recompute(event); e != nil {
				return e
			}
		} else {
			p, e := m.resolve(x, event)
			if e != nil {
				return e
			}
			m.Effects = append(m.Effects, map[string]any{"type": x["type"], "params": p})
		}
	}
	return nil
}
func (m *Machine) transition(v, event any) (bool, error) {
	for _, t := range list(v) {
		if s, ok := t.(string); ok {
			t = map[string]any{"target": s}
		}
		x := obj(t)
		yes, e := m.guard(x["guard"], event)
		if e != nil {
			return false, e
		}
		if !yes {
			continue
		}
		m.budget--
		if m.budget < 0 {
			return false, fail("LIMIT_EXCEEDED", "transition budget")
		}
		target := str(x["target"])
		external := target != "" && x["internal"] != true
		states := obj(m.Definition["states"])
		if external {
			if e := m.actions(obj(states[m.State])["exit"], event, 0); e != nil {
				return false, e
			}
		}
		if e := m.actions(x["actions"], event, 0); e != nil {
			return false, e
		}
		if target != "" {
			m.State = target
			m.Done = obj(states[target])["type"] == "final"
		}
		if external {
			if e := m.actions(obj(states[m.State])["entry"], event, 0); e != nil {
				return false, e
			}
		}
		return true, nil
	}
	return false, nil
}
func (m *Machine) stabilize(ev any) error {
	for !m.Done {
		yes, e := m.transition(obj(obj(m.Definition["states"])[m.State])["always"], ev)
		if e != nil {
			return e
		}
		if !yes {
			return nil
		}
	}
	return nil
}
func (m *Machine) Start() error {
	m.State = str(m.Definition["initial"])
	m.Done = obj(obj(m.Definition["states"])[m.State])["type"] == "final"
	ev := map[string]any{"type": "xstate.init"}
	if e := m.recompute(ev); e != nil {
		return e
	}
	if e := m.actions(obj(obj(m.Definition["states"])[m.State])["entry"], ev, 0); e != nil {
		return e
	}
	return m.stabilize(ev)
}
func (m *Machine) Send(ev any) error {
	if obj(ev) == nil || str(obj(ev)["type"]) == "" {
		return fail("INVALID_ARTIFACT", "event type")
	}
	if m.Done {
		return nil
	}
	m.budget = 1000
	if e := m.recompute(ev); e != nil {
		return e
	}
	n := str(obj(ev)["type"])
	yes, e := m.transition(obj(obj(obj(m.Definition["states"])[m.State])["on"])[n], ev)
	if e != nil {
		return e
	}
	if !yes {
		if _, e = m.transition(obj(m.Definition["on"])[n], ev); e != nil {
			return e
		}
	}
	if e := m.stabilize(ev); e != nil {
		return e
	}
	return m.recompute(ev)
}
func (m *Machine) Snapshot() map[string]any {
	return map[string]any{"state": m.State, "done": m.Done, "store": copyJSON(m.Store), "queries": copyJSON(m.Queries), "effects": copyJSON(m.Effects)}
}
func Handle(req any) (any, error) {
	q := obj(req)
	r := DefaultRegistry()
	for n, v := range obj(q["registry"]) {
		if v != "double" {
			return nil, fail("UNKNOWN_FUNCTION", "registry diagnostic")
		}
		r[n] = func(a []any) (any, error) {
			if len(a) != 1 {
				return nil, fail("TYPE_ERROR", "double arity")
			}
			return binary(12, a[0], float64(2))
		}
	}
	switch q["mode"] {
	case "expression":
		v, e := Evaluate(q["expression"], q["scope"], r)
		return map[string]any{"value": v}, e
	case "machine":
		m, e := LoadMachine(q["artifact"], r)
		if e != nil {
			return nil, e
		}
		if e = m.Start(); e != nil {
			return nil, e
		}
		for _, ev := range arr(q["events"]) {
			if e = m.Send(ev); e != nil {
				return nil, e
			}
		}
		return m.Snapshot(), nil
	case "capabilities":
		return map[string]any{"profile": "statepack.native/1", "language": "go", "bytecodeVersion": 1, "supportedOpcodes": []int{0, 1, 2, 3, 10, 11, 12, 13, 14, 15, 20, 30, 31, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43, 50, 51, 52, 53, 54, 55, 56, 57, 60, 61, 62, 63, 64, 70, 71, 80, 81, 82, 83, 90, 91, 92, 93, 100, 101, 110, 111, 116, 117, 130, 200}, "functions": []string{"length", "abs", "floor", "ceil", "round", "min", "max", "toString"}, "unsupported": []string{"nested states", "parallel states", "timers", "actors", "async invocation", "durable snapshots", "collection builtins", "lambda", "spread", "wildcard", "descent", "assign"}}, nil
	}
	return nil, fail("INVALID_ARTIFACT", "mode")
}

func scalarNumber(v any) any {
	switch x := v.(type) {
	case nil:
		return float64(0)
	case bool:
		if x {
			return float64(1)
		}
		return float64(0)
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return float64(0)
		}
		n, e := strconv.ParseFloat(s, 64)
		if e != nil {
			return math.NaN()
		}
		return n
	}
	return v
}

func pathDependency(path, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+".") || strings.HasPrefix(path, prefix+"[")
}
