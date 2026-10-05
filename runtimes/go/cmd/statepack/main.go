package main

import (
	"encoding/json"
	"io"
	"os"
	sp "statepack/runtime"
)

func main() {
	var out any
	func() {
		defer func() {
			if recover() != nil {
				out = map[string]any{"error": &sp.Error{Code: "INVALID_ARTIFACT", Message: "malformed input"}}
			}
		}()
		b, e := io.ReadAll(io.LimitReader(os.Stdin, 16<<20))
		if e != nil {
			out = map[string]any{"error": &sp.Error{Code: "INVALID_ARTIFACT", Message: e.Error()}}
			return
		}
		q, e := sp.Decode(b)
		if e != nil {
			out = map[string]any{"error": &sp.Error{Code: "INVALID_ARTIFACT", Message: e.Error()}}
			return
		}
		out, e = sp.Handle(q)
		if e != nil {
			if x, ok := e.(*sp.Error); ok {
				out = map[string]any{"error": x}
			} else {
				out = map[string]any{"error": &sp.Error{Code: "TYPE_ERROR", Message: e.Error()}}
			}
		}
	}()
	json.NewEncoder(os.Stdout).Encode(out)
}
