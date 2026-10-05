use serde_json::{json, Map, Value as V};
use std::collections::HashMap;
#[derive(Debug, Clone)]
pub struct Error {
    pub code: &'static str,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, Error>;
fn err<T>(code: &'static str, msg: impl Into<String>) -> Result<T> {
    Err(Error {
        code,
        message: msg.into(),
    })
}
pub type Function = Box<dyn Fn(&[V]) -> Result<V>>;
#[derive(Default)]
pub struct Registry {
    functions: HashMap<String, Function>,
}
impl Registry {
    pub fn register(&mut self, name: impl Into<String>, f: impl Fn(&[V]) -> Result<V> + 'static) {
        self.functions.insert(name.into(), Box::new(f));
    }
    pub fn contains(&self, n: &str) -> bool {
        self.functions.contains_key(n)
            || [
                "length", "abs", "floor", "ceil", "round", "min", "max", "toString",
            ]
            .contains(&n)
    }
    pub fn call(&self, n: &str, a: &[V]) -> Result<V> {
        if let Some(f) = self.functions.get(n) {
            return f(a);
        }
        let valid_arity = match n {
            "length" | "abs" | "floor" | "ceil" | "toString" => a.len() == 1,
            "round" => a.len() == 1 || a.len() == 2,
            "min" | "max" => !a.is_empty(),
            _ => true,
        };
        if !valid_arity {
            return err("TYPE_ERROR", format!("invalid argument count for {n}"));
        }
        let first = a.first().unwrap_or(&V::Null);
        match n {
            "length" => match first {
                V::String(s) => Ok(json!(s.encode_utf16().count())),
                V::Array(v) => Ok(json!(v.len())),
                _ => err("TYPE_ERROR", "length requires collection"),
            },
            "toString" => Ok(json!(js_string(first))),
            "abs" => number(num(first)?.abs()),
            "floor" => number(num(first)?.floor()),
            "ceil" => number(num(first)?.ceil()),
            "round" => {
                let decimals = match a.get(1) {
                    Some(v) => num(v)?,
                    None => 0.,
                };
                let f = 10f64.powf(decimals);
                number((num(first)? * f + 0.5).floor() / f)
            }
            "min" | "max" => {
                if a.is_empty() {
                    return err("TYPE_ERROR", "empty min/max");
                }
                let mut x = num(first)?;
                for v in &a[1..] {
                    x = if n == "min" {
                        x.min(num(v)?)
                    } else {
                        x.max(num(v)?)
                    };
                }
                number(x)
            }
            _ => err("UNKNOWN_FUNCTION", n),
        }
    }
}
fn num(v: &V) -> Result<f64> {
    v.as_f64().ok_or(Error {
        code: "TYPE_ERROR",
        message: "expected number".into(),
    })
}
fn number(n: f64) -> Result<V> {
    serde_json::Number::from_f64(n).map(V::Number).ok_or(Error {
        code: "TYPE_ERROR",
        message: "nonfinite result".into(),
    })
}
pub fn truthy(v: &V) -> bool {
    !v.is_null() && v != &V::Bool(false)
}
fn js_number_string(n: f64) -> String {
    if n == 0. {
        return "0".into();
    }
    let absolute = n.abs();
    if !(1e-6..1e21).contains(&absolute) {
        let result = format!("{n:e}");
        let (mantissa, exponent) = result.split_once('e').unwrap();
        let exponent: i32 = exponent.parse().unwrap();
        return format!(
            "{mantissa}e{}{exponent}",
            if exponent >= 0 { "+" } else { "" }
        );
    }
    n.to_string()
}
fn js_string(v: &V) -> String {
    match v {
        V::String(s) => s.clone(),
        V::Null => "null".into(),
        V::Number(n) => js_number_string(n.as_f64().unwrap_or(0.)),
        V::Object(_) => "[object Object]".into(),
        V::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        _ => v.to_string(),
    }
}
fn signed_integer(v: &V) -> Option<i64> {
    v.as_i64().or_else(|| {
        v.as_f64()
            .filter(|n| {
                n.is_finite() && n.fract() == 0. && *n >= i64::MIN as f64 && *n < i64::MAX as f64
            })
            .map(|n| n as i64)
    })
}
fn dangerous(k: &str) -> bool {
    ["__proto__", "prototype", "constructor"].contains(&k)
}
fn access(v: &V, k: &V) -> V {
    if let Some(s) = k.as_str() {
        if dangerous(s) {
            return V::Null;
        }
        if s == "length" {
            match v {
                V::Array(a) => return json!(a.len()),
                V::String(s) => return json!(s.encode_utf16().count()),
                _ => {}
            }
        }
        return v.get(s).cloned().unwrap_or(V::Null);
    }
    if let Some(i) = signed_integer(k) {
        match v {
            V::Array(a) => {
                let j = if i < 0 { a.len() as i64 + i } else { i };
                return if j >= 0 {
                    a.get(j as usize).cloned().unwrap_or(V::Null)
                } else {
                    V::Null
                };
            }
            V::String(s) => {
                let units: Vec<_> = s.encode_utf16().collect();
                let j = if i < 0 { units.len() as i64 + i } else { i };
                return if j >= 0 {
                    units
                        .get(j as usize)
                        .map(|u| json!(String::from_utf16_lossy(&[*u])))
                        .unwrap_or(V::Null)
                } else {
                    V::Null
                };
            }
            _ => {}
        }
    }
    V::Null
}
fn checked_access(v: &V, k: &V) -> Result<V> {
    if let (V::String(s), Some(i)) = (v, signed_integer(k)) {
        let units: Vec<_> = s.encode_utf16().collect();
        let j = if i < 0 { units.len() as i64 + i } else { i };
        if j >= 0 {
            if let Some(u) = units.get(j as usize) {
                if (0xD800..=0xDFFF).contains(u) {
                    return err("UNSUPPORTED_FEATURE", "isolated UTF-16 surrogate indexing");
                }
            }
        }
    }
    Ok(access(v, k))
}
fn checked_path(scope: &V, p: &str) -> Result<V> {
    if p == "$context" || p.starts_with("$context.") || p == "$env" || p.starts_with("$env.") {
        return Ok(V::Null);
    }
    if p == "$" {
        return Ok(scope.clone());
    }
    let p = p
        .strip_prefix("$.")
        .unwrap_or(p)
        .replace('[', ".")
        .replace(']', "");
    let mut v = scope.clone();
    for s in p.split('.').filter(|s| !s.is_empty()) {
        v = checked_access(&v, &s.parse::<i64>().map(|n| json!(n)).unwrap_or(json!(s)))?;
    }
    Ok(v)
}
pub fn path(scope: &V, p: &str) -> V {
    let mut p = p;
    if p == "$context" || p.starts_with("$context.") || p == "$env" || p.starts_with("$env.") {
        return V::Null;
    }
    if p == "$" {
        return scope.clone();
    }
    if let Some(s) = p.strip_prefix("$.") {
        p = s;
    }
    let p = p.replace('[', ".").replace(']', "");
    let mut v = scope.clone();
    for s in p.split('.').filter(|s| !s.is_empty()) {
        v = access(&v, &s.parse::<i64>().map(|n| json!(n)).unwrap_or(json!(s)));
    }
    v
}
fn integer(v: &V) -> Result<usize> {
    v.as_u64()
        .and_then(|x| usize::try_from(x).ok())
        .ok_or(Error {
            code: "INVALID_INSTRUCTION",
            message: "expected nonnegative integer".into(),
        })
}
fn contains_lambda(v: &V) -> bool {
    match v {
        V::Object(o) => o.contains_key("__lambda") || o.values().any(contains_lambda),
        V::Array(a) => a.iter().any(contains_lambda),
        _ => false,
    }
}
pub fn validate(expression: &V, r: &Registry) -> Result<()> {
    if expression["engine"] != "yexp"
        || expression["artifactVersion"] != 1
        || expression["program"]["version"] != 1
    {
        return err("INVALID_ARTIFACT", "unsupported expression version");
    }
    let p = &expression["program"];
    let slots = p["slots"].as_array().ok_or(Error {
        code: "INVALID_ARTIFACT",
        message: "missing slots".into(),
    })?;
    if slots.iter().any(|v| !v.is_string()) {
        return err("INVALID_ARTIFACT", "slot must be string");
    };
    for slot in slots {
        let path = slot.as_str().unwrap();
        if !(path == "$"
            || path.starts_with("$.")
            || path == "$context"
            || path.starts_with("$context.")
            || path == "$env"
            || path.starts_with("$env."))
        {
            return err("UNSUPPORTED_FEATURE", "slot source");
        };
        if path.contains('[') {
            for tail in path.split('[').skip(1) {
                let index = tail.split(']').next().unwrap();
                if index.parse::<i64>().is_err() || !tail.contains(']') {
                    return err("UNSUPPORTED_FEATURE", "slot bracket syntax");
                }
            }
        }
    }
    let constants = p["constants"].as_array().ok_or(Error {
        code: "INVALID_ARTIFACT",
        message: "missing constants".into(),
    })?;
    if constants.iter().any(contains_lambda) {
        return err("UNSUPPORTED_FEATURE", "lambda constant");
    };
    let code = p["code"].as_array().ok_or(Error {
        code: "INVALID_ARTIFACT",
        message: "missing code".into(),
    })?;
    for raw in code {
        let i = raw.as_array().ok_or(Error {
            code: "INVALID_INSTRUCTION",
            message: "instruction must be array".into(),
        })?;
        let op = i.first().and_then(V::as_i64).ok_or(Error {
            code: "INVALID_INSTRUCTION",
            message: "missing opcode".into(),
        })?;
        let arity = match op {
            0 | 1 | 70 | 71 | 80..=83 | 91..=93 | 100 | 101 | 110 | 111 | 116 | 117 => 2,
            40..=43 => 4,
            50..=57 | 60..=64 | 130 => 3,
            2 | 3 | 10..=15 | 20 | 30..=37 | 90 | 200 => 1,
            _ => return err("UNSUPPORTED_FEATURE", format!("opcode {op}")),
        };
        if i.len() != arity {
            return err("INVALID_INSTRUCTION", "wrong arity");
        };
        if op == 0 && integer(&i[1])? >= constants.len() {
            return err("INVALID_INSTRUCTION", "constant index");
        };
        if matches!(op,1|40..=43|50..=57|60..=64|70|71|80..=83) && integer(&i[1])? >= slots.len() {
            return err("INVALID_INSTRUCTION", "slot index");
        };
        if matches!(op, 91..=93) && integer(&i[1])? >= code.len() {
            return err("INVALID_INSTRUCTION", "jump target");
        };
        if matches!(op, 100 | 101) {
            integer(&i[1])?;
        }
        if matches!(op, 110 | 111 | 117) && i[1].as_i64().is_none() {
            return err("INVALID_INSTRUCTION", "index operand");
        };
        if op == 116 && !i[1].is_string() {
            return err("INVALID_INSTRUCTION", "property operand");
        };
        if op == 130 {
            let n = i[1].as_str().ok_or(Error {
                code: "INVALID_INSTRUCTION",
                message: "function name".into(),
            })?;
            integer(&i[2])?;
            if !r.contains(n) {
                return err("UNKNOWN_FUNCTION", n);
            }
        }
    }
    Ok(())
}
fn pop(s: &mut Vec<V>) -> Result<V> {
    s.pop().ok_or(Error {
        code: "INVALID_INSTRUCTION",
        message: "stack underflow".into(),
    })
}
fn binary(op: i64, a: V, b: V) -> Result<V> {
    match op {
        10 => {
            if a.is_string() && b.is_string() {
                Ok(json!(format!(
                    "{}{}",
                    a.as_str().unwrap(),
                    b.as_str().unwrap()
                )))
            } else {
                number(num(&a)? + num(&b)?)
            }
        }
        11 => number(num(&a)? - num(&b)?),
        12 => number(num(&a)? * num(&b)?),
        13 | 14 => {
            let y = num(&b)?;
            if y == 0. {
                return err("DIVISION_BY_ZERO", "division by zero");
            };
            number(if op == 13 { num(&a)? / y } else { num(&a)? % y })
        }
        30 | 31 | 36 | 37 => {
            if a.is_array() || a.is_object() || b.is_array() || b.is_object() {
                return err("UNSUPPORTED_FEATURE", "collection equality");
            };
            let equal = if a.is_number() && b.is_number() {
                a.as_f64() == b.as_f64()
            } else {
                a == b
            };
            Ok(json!(if op == 31 || op == 37 { !equal } else { equal }))
        }
        32..=35 => {
            let order = if let (Some(x), Some(y)) = (a.as_f64(), b.as_f64()) {
                x.partial_cmp(&y)
            } else {
                return err("TYPE_ERROR", "comparison types");
            };
            Ok(json!(match op {
                32 => order == Some(std::cmp::Ordering::Less),
                33 => order == Some(std::cmp::Ordering::Greater),
                34 => order != Some(std::cmp::Ordering::Greater),
                _ => order != Some(std::cmp::Ordering::Less),
            }))
        }
        _ => err("INVALID_INSTRUCTION", "binary opcode"),
    }
}
pub fn evaluate(expression: &V, scope: &V, r: &Registry) -> Result<V> {
    validate(expression, r)?;
    let p = &expression["program"];
    let code = p["code"].as_array().unwrap();
    let slots: Vec<_> = p["slots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| checked_path(scope, v.as_str().unwrap()))
        .collect::<Result<Vec<_>>>()?;
    let mut stack = Vec::new();
    let mut pc = 0;
    let mut budget = 100000;
    while pc < code.len() {
        if budget == 0 {
            return err("LIMIT_EXCEEDED", "instruction budget");
        };
        budget -= 1;
        let i = code[pc].as_array().unwrap();
        let op = i[0].as_i64().unwrap();
        match op {
            0 => stack.push(p["constants"][integer(&i[1])?].clone()),
            1 => stack.push(slots[integer(&i[1])?].clone()),
            2 => {
                let v = stack.last().cloned().ok_or(Error {
                    code: "INVALID_INSTRUCTION",
                    message: "stack underflow".into(),
                })?;
                stack.push(v)
            }
            3 => {
                pop(&mut stack)?;
            }
            10..=14 | 30..=37 => {
                let b = pop(&mut stack)?;
                let a = pop(&mut stack)?;
                stack.push(binary(op, a, b)?);
            }
            15 => {
                let v = pop(&mut stack)?;
                stack.push(number(-num(&v)?)?);
            }
            20 => {
                let v = pop(&mut stack)?;
                stack.push(json!(js_string(&v)));
            }
            40..=43 => {
                let v = &slots[integer(&i[1])?];
                let lo = binary(
                    if op == 40 || op == 42 { 35 } else { 33 },
                    v.clone(),
                    i[2].clone(),
                )?;
                let hi = binary(
                    if op == 40 || op == 43 { 34 } else { 32 },
                    v.clone(),
                    i[3].clone(),
                )?;
                stack.push(json!(truthy(&lo) && truthy(&hi)));
            }
            50..=57 => stack.push(binary(
                [33, 35, 32, 34, 30, 31, 36, 37][(op - 50) as usize],
                slots[integer(&i[1])?].clone(),
                i[2].clone(),
            )?),
            60..=64 => stack.push(binary(
                op - 50,
                slots[integer(&i[1])?].clone(),
                i[2].clone(),
            )?),
            70 | 71 => stack.push(binary(
                if op == 70 { 10 } else { 11 },
                slots[integer(&i[1])?].clone(),
                json!(1),
            )?),
            80..=83 => {
                let v = &slots[integer(&i[1])?];
                stack.push(json!(match op {
                    80 => v.is_null(),
                    81 => !v.is_null(),
                    82 => truthy(v),
                    _ => !truthy(v),
                }));
            }
            90 => {
                let v = pop(&mut stack)?;
                stack.push(json!(!truthy(&v)));
            }
            91 | 92 => {
                let v = pop(&mut stack)?;
                if truthy(&v) == (op == 92) {
                    pc = integer(&i[1])?;
                    continue;
                }
            }
            93 => {
                pc = integer(&i[1])?;
                continue;
            }
            100 | 101 => {
                let count = integer(&i[1])?;
                let n = count
                    .checked_mul(if op == 101 { 2 } else { 1 })
                    .ok_or(Error {
                        code: "INVALID_INSTRUCTION",
                        message: "count overflow".into(),
                    })?;
                if n > stack.len() {
                    return err("INVALID_INSTRUCTION", "stack underflow");
                };
                let items = stack.split_off(stack.len() - n);
                if op == 100 {
                    stack.push(V::Array(items))
                } else {
                    let mut obj = Map::new();
                    for pair in items.chunks(2) {
                        let k = pair[0].as_str().ok_or(Error {
                            code: "TYPE_ERROR",
                            message: "object key".into(),
                        })?;
                        if !dangerous(k) {
                            obj.insert(k.into(), pair[1].clone());
                        }
                    }
                    stack.push(V::Object(obj));
                }
            }
            110 | 111 | 117 => {
                let k = if i[1] == -1 {
                    pop(&mut stack)?
                } else {
                    i[1].clone()
                };
                let v = pop(&mut stack)?;
                stack.push(checked_access(&v, &k)?);
            }
            116 => {
                let v = pop(&mut stack)?;
                stack.push(checked_access(&v, &i[1])?);
            }
            130 => {
                let n = integer(&i[2])?;
                if n > stack.len() {
                    return err("INVALID_INSTRUCTION", "call stack underflow");
                };
                let args = stack.split_off(stack.len() - n);
                stack.push(r.call(i[1].as_str().unwrap(), &args)?);
            }
            200 => return pop(&mut stack),
            _ => unreachable!(),
        }
        pc += 1;
    }
    err("INVALID_INSTRUCTION", "missing return")
}
fn object(v: &V) -> Result<&Map<String, V>> {
    v.as_object().ok_or(Error {
        code: "INVALID_ARTIFACT",
        message: "expected object".into(),
    })
}
fn table(v: &V, r: &Registry) -> Result<Map<String, V>> {
    let mut out = Map::new();
    for entry in v.as_array().ok_or(Error {
        code: "INVALID_ARTIFACT",
        message: "expression table".into(),
    })? {
        let a = entry.as_array().ok_or(Error {
            code: "INVALID_ARTIFACT",
            message: "expression pair".into(),
        })?;
        if a.len() != 2 {
            return err("INVALID_ARTIFACT", "expression pair length");
        };
        let id = a[0].as_str().ok_or(Error {
            code: "INVALID_ARTIFACT",
            message: "expression id".into(),
        })?;
        if out.contains_key(id) {
            return err("INVALID_ARTIFACT", "duplicate expression");
        };
        validate(&a[1], r)?;
        out.insert(id.into(), a[1].clone());
    }
    Ok(out)
}
pub struct Machine<'a> {
    definition: V,
    expressions: Map<String, V>,
    slice_expr: Map<String, V>,
    pub store: V,
    pub queries: V,
    pub state: String,
    pub effects: Vec<V>,
    registry: &'a Registry,
    steps: usize,
}
impl<'a> Machine<'a> {
    pub fn load(artifact: &V, registry: &'a Registry) -> Result<Self> {
        if artifact["format"] != "statepack.compiled"
            || artifact["version"] != 1
            || artifact["definition"]["expressionEngine"] != "yexp"
        {
            return err("INVALID_ARTIFACT", "machine format/version/engine");
        };
        let d = &artifact["definition"];
        let states = object(&d["states"])?;
        let initial = d["initial"].as_str().ok_or(Error {
            code: "INVALID_ARTIFACT",
            message: "initial state".into(),
        })?;
        if !states.contains_key(initial) {
            return err("INVALID_ARTIFACT", "unknown initial");
        };
        let expressions = table(&artifact["expressions"], registry)?;
        let mut slice_expr = Map::new();
        for slice in artifact["slices"].as_array().ok_or(Error {
            code: "INVALID_ARTIFACT",
            message: "slice tables".into(),
        })? {
            let name = slice["name"].as_str().ok_or(Error {
                code: "INVALID_ARTIFACT",
                message: "slice name".into(),
            })?;
            if slice_expr.contains_key(name) {
                return err("INVALID_ARTIFACT", "duplicate slice");
            };
            slice_expr.insert(
                name.into(),
                V::Object(table(&slice["expressions"], registry)?),
            );
        }
        let mut store = Map::new();
        let empty = Map::new();
        for (name, s) in d.get("store").map(object).transpose()?.unwrap_or(&empty) {
            for key in object(s)?.keys() {
                if !["context", "queries", "mutations", "meta"].contains(&key.as_str()) {
                    return err("UNSUPPORTED_FEATURE", format!("slice field {key}"));
                }
            }
            if !slice_expr.contains_key(name) {
                return err("INVALID_ARTIFACT", "missing slice table");
            };
            store.insert(name.clone(), V::Object(object(&s["context"])?.clone()));
            for q in s
                .get("queries")
                .map(object)
                .transpose()?
                .unwrap_or(&empty)
                .values()
            {
                if !q.is_string() || slice_expr[name].get(q.as_str().unwrap()).is_none() {
                    return err("INVALID_ARTIFACT", "missing query expression");
                }
            }
            for mutation in s
                .get("mutations")
                .map(object)
                .transpose()?
                .unwrap_or(&empty)
                .values()
            {
                for expression in object(mutation)?.values() {
                    if !expression.is_string()
                        || slice_expr[name].get(expression.as_str().unwrap()).is_none()
                    {
                        return err("INVALID_ARTIFACT", "missing mutation expression");
                    }
                }
            }
        }
        if slice_expr.len() != store.len() {
            return err("INVALID_ARTIFACT", "unexpected slice table");
        };
        let mut m = Self {
            definition: d.clone(),
            expressions,
            slice_expr,
            store: V::Object(store),
            queries: json!({}),
            state: initial.into(),
            effects: vec![],
            registry,
            steps: 0,
        };
        m.validate_definition()?;
        m.recompute(&json!({"type":"xstate.init"}))?;
        let entry = m.definition["states"][&m.state]["entry"].clone();
        m.actions(&entry, &json!({"type":"xstate.init"}), 0)?;
        m.stabilize(&json!({"type":"xstate.init"}))?;
        Ok(m)
    }
    fn validate_definition(&self) -> Result<()> {
        for k in object(&self.definition)?.keys() {
            if ![
                "id",
                "expressionEngine",
                "initial",
                "store",
                "states",
                "on",
                "actions",
                "guards",
                "meta",
                "description",
                "version",
            ]
            .contains(&k.as_str())
            {
                return err("UNSUPPORTED_FEATURE", format!("machine field {k}"));
            }
        }
        for s in object(&self.definition["states"])?.values() {
            for k in object(s)?.keys() {
                if ![
                    "type",
                    "on",
                    "entry",
                    "exit",
                    "always",
                    "meta",
                    "description",
                    "tags",
                ]
                .contains(&k.as_str())
                {
                    return err("UNSUPPORTED_FEATURE", format!("state field {k}"));
                }
            }
            if let Some(t) = s.get("type") {
                if t != "atomic" && t != "final" {
                    return err("UNSUPPORTED_FEATURE", "state type");
                }
            }
            self.validate_actions(&s["entry"], 0)?;
            self.validate_actions(&s["exit"], 0)?;
            self.validate_transition(&s["always"])?;
            if let Some(on) = s.get("on") {
                for t in object(on)?.values() {
                    self.validate_transition(t)?;
                }
            }
        }
        if let Some(on) = self.definition.get("on") {
            for t in object(on)?.values() {
                self.validate_transition(t)?;
            }
        }
        if let Some(a) = self.definition.get("actions") {
            for v in object(a)?.values() {
                self.validate_actions(v, 0)?;
            }
        }
        if let Some(g) = self.definition.get("guards") {
            for v in object(g)?.values() {
                self.validate_guard(v, 0)?;
            }
        }
        Ok(())
    }
    fn validate_transition(&self, t: &V) -> Result<()> {
        if t.is_null() {
            return Ok(());
        }
        if let Some(a) = t.as_array() {
            for v in a {
                self.validate_transition(v)?
            }
            return Ok(());
        }
        if let Some(s) = t.as_str() {
            if self.definition["states"].get(s).is_none() {
                return err("INVALID_ARTIFACT", "unknown target");
            };
            return Ok(());
        }
        for k in object(t)?.keys() {
            if ![
                "target",
                "guard",
                "actions",
                "internal",
                "meta",
                "description",
            ]
            .contains(&k.as_str())
            {
                return err("UNSUPPORTED_FEATURE", format!("transition field {k}"));
            }
        }
        if let Some(target) = t.get("target") {
            if !target.is_string()
                || self.definition["states"]
                    .get(target.as_str().unwrap())
                    .is_none()
            {
                return err("INVALID_ARTIFACT", "unknown target");
            }
        }
        self.validate_actions(&t["actions"], 0)?;
        if let Some(g) = t.get("guard") {
            self.validate_guard(g, 0)?;
        }
        Ok(())
    }
    fn mutation(&self, name: &str) -> Result<(String, V)> {
        let store = object(&self.store)?;
        let parts: Vec<_> = name.splitn(2, '.').collect();
        let (slice, key) = if parts.len() == 2 {
            (parts[0], parts[1])
        } else if store.len() == 1 {
            (store.keys().next().unwrap().as_str(), name)
        } else {
            return err("INVALID_ARTIFACT", "mutation needs slice prefix");
        };
        let m = &self.definition["store"][slice]["mutations"][key];
        if m.is_null() {
            return err("INVALID_ARTIFACT", "unknown mutation");
        };
        Ok((slice.into(), m.clone()))
    }
    fn validate_actions(&self, a: &V, depth: usize) -> Result<()> {
        if depth > 100 {
            return err("LIMIT_EXCEEDED", "action cycle");
        }
        if a.is_null() {
            return Ok(());
        }
        if let Some(list) = a.as_array() {
            for v in list {
                self.validate_actions(v, depth + 1)?
            }
            return Ok(());
        }
        if let Some(name) = a.as_str() {
            let target = &self.definition["actions"][name];
            if target.is_null() {
                return err("INVALID_ARTIFACT", "unknown named action");
            };
            return self.validate_actions(target, depth + 1);
        }
        if a.get("condition").is_some() {
            return err("UNSUPPORTED_FEATURE", "conditional action");
        }
        let typ = a["type"].as_str().ok_or(Error {
            code: "INVALID_ARTIFACT",
            message: "action type".into(),
        })?;
        match typ {
            "mutation" => {
                let name = a["name"].as_str().ok_or(Error {
                    code: "INVALID_ARTIFACT",
                    message: "mutation name".into(),
                })?;
                self.mutation(name)?;
                for key in object(a)?.keys() {
                    if !["type", "name", "payload", "meta"].contains(&key.as_str()) {
                        return err("UNSUPPORTED_FEATURE", "mutation action field");
                    }
                }
                if let Some(payload) = a.get("payload") {
                    object(payload)?;
                }
            }
            "log" | "host.event" => {
                self.validate_effect(a)?;
            }
            _ => return err("UNSUPPORTED_FEATURE", format!("action {typ}")),
        }
        Ok(())
    }
    fn validate_effect(&self, v: &V) -> Result<()> {
        match v {
            V::String(s) if s.starts_with("expr:") => {
                if !self.expressions.contains_key(s) {
                    return err("INVALID_ARTIFACT", "missing effect expression");
                }
            }
            V::Array(a) => {
                for v in a {
                    self.validate_effect(v)?
                }
            }
            V::Object(o) => {
                for v in o.values() {
                    self.validate_effect(v)?
                }
            }
            _ => {}
        }
        Ok(())
    }
    fn flat(&self) -> V {
        let mut out = Map::new();
        // Expression tables retain artifact.slices order, which is authoritative.
        for name in self.slice_expr.keys() {
            for (k, v) in self.store[name].as_object().unwrap() {
                out.insert(k.clone(), v.clone());
            }
        }
        // Queries shadow every context field, even one from a later slice.
        for name in self.slice_expr.keys() {
            if let Some(q) = self.queries[name].as_object() {
                for (k, v) in q {
                    out.insert(k.clone(), v.clone());
                }
            }
        }
        V::Object(out)
    }
    fn validate_guard(&self, g: &V, depth: usize) -> Result<()> {
        if let Some(obj) = g.as_object() {
            for k in obj.keys() {
                if !["condition", "and", "or", "not"].contains(&k.as_str()) {
                    return err("UNSUPPORTED_FEATURE", "guard field");
                }
            }
            if obj.len() != 1 {
                return err("INVALID_ARTIFACT", "guard must have one operator");
            }
        }

        if depth > 100 {
            return err("LIMIT_EXCEEDED", "guard depth");
        };
        if let Some(name) = g.as_str() {
            let v = &self.definition["guards"][name];
            if v.is_null() {
                return err("INVALID_ARTIFACT", "unknown guard");
            };
            return self.validate_guard(v, depth + 1);
        }
        if let Some(c) = g.get("condition") {
            return self.validate_condition(c, depth + 1);
        }
        for key in ["and", "or"] {
            if let Some(a) = g.get(key) {
                for v in a.as_array().ok_or(Error {
                    code: "INVALID_ARTIFACT",
                    message: "guard list".into(),
                })? {
                    self.validate_guard(v, depth + 1)?;
                }
                return Ok(());
            }
        }
        if let Some(v) = g.get("not") {
            return self.validate_guard(v, depth + 1);
        }
        err("UNSUPPORTED_FEATURE", "guard")
    }
    fn validate_condition(&self, c: &V, depth: usize) -> Result<()> {
        if let Some(obj) = c.as_object() {
            for k in obj.keys() {
                if ![
                    "type",
                    "value",
                    "path",
                    "optional",
                    "op",
                    "left",
                    "right",
                    "conditions",
                    "condition",
                ]
                .contains(&k.as_str())
                {
                    return err("UNSUPPORTED_FEATURE", "condition field");
                }
            }
        }

        if depth > 100 {
            return err("LIMIT_EXCEEDED", "condition depth");
        };
        if c.is_boolean() || c.is_string() {
            return Ok(());
        }
        match c["type"].as_str() {
            Some("literal") => {
                if c["value"].is_array() || c["value"].is_object() {
                    return err("UNSUPPORTED_FEATURE", "condition literal");
                }
            }
            Some("truthy") => {
                if !c["path"].is_string() {
                    return err("INVALID_ARTIFACT", "truthy path");
                }
            }
            Some("compare") => {
                if !["==", "!=", "===", "!==", "<", ">", "<=", ">="]
                    .contains(&c["op"].as_str().unwrap_or(""))
                {
                    return err("INVALID_ARTIFACT", "compare op");
                };
                for v in [&c["left"], &c["right"]] {
                    if v.is_object() {
                        match v["type"].as_str() {
                            Some("ref") if v["path"].is_string() => {}
                            Some("literal")
                                if !v["value"].is_array() && !v["value"].is_object() => {}
                            _ => return err("UNSUPPORTED_FEATURE", "condition operand"),
                        }
                    } else if v.is_array() {
                        return err("UNSUPPORTED_FEATURE", "condition operand");
                    }
                }
            }
            Some("and") | Some("or") => {
                for v in c["conditions"].as_array().ok_or(Error {
                    code: "INVALID_ARTIFACT",
                    message: "condition list".into(),
                })? {
                    self.validate_condition(v, depth + 1)?;
                }
            }
            Some("not") => self.validate_condition(&c["condition"], depth + 1)?,
            _ => return err("UNSUPPORTED_FEATURE", "condition"),
        };
        Ok(())
    }
    fn condition_value(&self, v: &V, scope: &V) -> Result<V> {
        match v["type"].as_str() {
            Some("ref") => Ok(path(
                scope,
                v["path"].as_str().ok_or(Error {
                    code: "INVALID_ARTIFACT",
                    message: "ref path".into(),
                })?,
            )),
            Some("literal") => Ok(v["value"].clone()),
            Some(_) => err("UNSUPPORTED_FEATURE", "condition operand"),
            None => Ok(v.clone()),
        }
    }
    fn condition(&self, c: &V, s: &V, depth: usize) -> Result<bool> {
        if depth > 100 {
            return err("LIMIT_EXCEEDED", "condition depth");
        }
        if let Some(b) = c.as_bool() {
            return Ok(b);
        }
        if let Some(p) = c.as_str() {
            return Ok(condition_truthy(&path(s, p)));
        }
        match c["type"].as_str() {
            Some("literal") => Ok(condition_truthy(&c["value"])),
            Some("truthy") => Ok(condition_truthy(&path(s, c["path"].as_str().unwrap_or("")))),
            Some("compare") => {
                let op = match c["op"].as_str() {
                    Some("==") => 30,
                    Some("!=") => 31,
                    Some("<") => 32,
                    Some(">") => 33,
                    Some("<=") => 34,
                    Some(">=") => 35,
                    Some("===") => 36,
                    Some("!==") => 37,
                    _ => return err("INVALID_ARTIFACT", "compare operator"),
                };
                let a = self.condition_value(&c["left"], s)?;
                let b = self.condition_value(&c["right"], s)?;
                Ok(condition_compare(op, &a, &b)?)
            }
            Some("and") | Some("or") => {
                let and = c["type"] == "and";
                let mut result = and;
                for v in c["conditions"].as_array().ok_or(Error {
                    code: "INVALID_ARTIFACT",
                    message: "conditions array".into(),
                })? {
                    let b = self.condition(v, s, depth + 1)?;
                    result = if and { result && b } else { result || b };
                }
                Ok(result)
            }
            Some("not") => Ok(!self.condition(&c["condition"], s, depth + 1)?),
            _ => err("UNSUPPORTED_FEATURE", "condition"),
        }
    }
    fn guard(&self, g: &V, s: &V, depth: usize) -> Result<bool> {
        if depth > 100 {
            return err("LIMIT_EXCEEDED", "guard cycle");
        }
        if let Some(name) = g.as_str() {
            let v = &self.definition["guards"][name];
            if v.is_null() {
                return err("INVALID_ARTIFACT", "unknown guard");
            };
            return self.guard(v, s, depth + 1);
        }
        if let Some(c) = g.get("condition") {
            return self.condition(c, s, depth + 1);
        }
        for key in ["and", "or"] {
            if let Some(a) = g.get(key) {
                let mut result = key == "and";
                for v in a.as_array().ok_or(Error {
                    code: "INVALID_ARTIFACT",
                    message: "guard list".into(),
                })? {
                    let b = self.guard(v, s, depth + 1)?;
                    result = if key == "and" {
                        result && b
                    } else {
                        result || b
                    };
                }
                return Ok(result);
            }
        }
        if let Some(v) = g.get("not") {
            return Ok(!self.guard(v, s, depth + 1)?);
        }
        err("UNSUPPORTED_FEATURE", "guard")
    }
    fn recompute(&mut self, event: &V) -> Result<()> {
        let mut all = Map::new();
        let names: Vec<_> = self.store.as_object().unwrap().keys().cloned().collect();
        for name in names {
            let mut qs = Map::new();
            let empty = Map::new();
            let defs = self.definition["store"][&name]
                .get("queries")
                .map(object)
                .transpose()?
                .unwrap_or(&empty);
            let mut pending: Vec<_> = defs.keys().cloned().collect();
            while !pending.is_empty() {
                let mut progress = false;
                for key in pending.clone() {
                    let id = defs[&key].as_str().unwrap();
                    let expr = &self.slice_expr[&name][id];
                    let slots = expr["program"]["slots"].as_array().unwrap();
                    let blocked = slots.iter().filter_map(V::as_str).any(|p| {
                        let tail = p
                            .strip_prefix("$.context.")
                            .or_else(|| p.strip_prefix("$.queries."));
                        tail.map(|tail| {
                            let dep = tail.split('.').next().unwrap();
                            defs.contains_key(dep) && !qs.contains_key(dep)
                        })
                        .unwrap_or(false)
                    });
                    if blocked {
                        continue;
                    }
                    let mut ctx = self.store[&name].as_object().unwrap().clone();
                    ctx.extend(qs.clone());
                    let scope = json!({"context":ctx,"event":event,"queries":qs,"$context":self.store,"$root":self.store});
                    let value = evaluate(expr, &scope, self.registry)?;
                    qs.insert(key.clone(), value);
                    pending.retain(|x| x != &key);
                    progress = true;
                }
                if !progress {
                    return err("INVALID_ARTIFACT", "query dependency cycle");
                }
            }
            all.insert(name, V::Object(qs));
        }
        self.queries = V::Object(all);
        Ok(())
    }
    fn resolve(&self, v: &V, scope: &V) -> Result<V> {
        match v {
            V::String(s) if self.expressions.contains_key(s) => {
                evaluate(&self.expressions[s], scope, self.registry)
            }
            V::Array(a) => Ok(V::Array(
                a.iter()
                    .map(|v| self.resolve(v, scope))
                    .collect::<Result<_>>()?,
            )),
            V::Object(o) => {
                let mut out = Map::new();
                for (k, v) in o {
                    out.insert(k.clone(), self.resolve(v, scope)?);
                }
                Ok(V::Object(out))
            }
            _ => Ok(v.clone()),
        }
    }
    fn actions(&mut self, a: &V, event: &V, depth: usize) -> Result<()> {
        if depth > 100 {
            return err("LIMIT_EXCEEDED", "action cycle");
        }
        if a.is_null() {
            return Ok(());
        }
        if let Some(list) = a.as_array() {
            for v in list {
                self.actions(v, event, depth + 1)?
            }
            return Ok(());
        }
        if let Some(name) = a.as_str() {
            let target = self.definition["actions"][name].clone();
            return self.actions(&target, event, depth + 1);
        }
        if a["type"] == "mutation" {
            let (slice, fields) = self.mutation(a["name"].as_str().unwrap())?;
            let mut ev = object(event)?.clone();
            if let Some(payload) = a.get("payload") {
                ev.extend(object(payload)?.clone());
            }
            let mut ctx = object(&self.store[&slice])?.clone();
            if let Some(q) = self.queries[&slice].as_object() {
                ctx.extend(q.clone());
            }
            let scope = json!({"context":ctx,"event":ev,"queries":self.queries[&slice],"$context":self.store,"$root":self.store});
            let mut updates = Map::new();
            for (k, id) in object(&fields)? {
                updates.insert(
                    k.clone(),
                    evaluate(
                        &self.slice_expr[&slice][id.as_str().unwrap()],
                        &scope,
                        self.registry,
                    )?,
                );
            }
            self.store[&slice].as_object_mut().unwrap().extend(updates);
            self.recompute(event)?;
        } else {
            let scope = json!({"context":self.flat(),"event":event});
            let params = self.resolve(a, &scope)?;
            self.effects.push(json!({"type":a["type"],"params":params}));
        }
        Ok(())
    }
    fn choose(&self, t: &V, event: &V) -> Result<Option<V>> {
        if t.is_null() {
            return Ok(None);
        }
        if let Some(a) = t.as_array() {
            for t in a {
                if let Some(v) = self.choose(t, event)? {
                    return Ok(Some(v));
                }
            }
            return Ok(None);
        }
        if let Some(s) = t.as_str() {
            return Ok(Some(json!({"target":s})));
        }
        if let Some(g) = t.get("guard") {
            if !self.guard(g, &json!({"context":self.flat(),"event":event}), 0)? {
                return Ok(None);
            }
        }
        Ok(Some(t.clone()))
    }
    fn transition(&mut self, t: &V, event: &V) -> Result<()> {
        self.steps += 1;
        if self.steps > 1000 {
            return err("LIMIT_EXCEEDED", "transition budget");
        };
        let target = t.get("target").and_then(V::as_str);
        let external = target.is_some() && t["internal"] != true;
        if external {
            let a = self.definition["states"][&self.state]["exit"].clone();
            self.actions(&a, event, 0)?;
        }
        self.actions(&t["actions"], event, 0)?;
        if let Some(target) = target {
            self.state = target.into();
        }
        if external {
            let a = self.definition["states"][&self.state]["entry"].clone();
            self.actions(&a, event, 0)?;
        }
        self.recompute(event)
    }
    fn stabilize(&mut self, event: &V) -> Result<()> {
        loop {
            if self.done() {
                break;
            }
            let t = self.definition["states"][&self.state]["always"].clone();
            if let Some(t) = self.choose(&t, event)? {
                self.transition(&t, event)?
            } else {
                break;
            }
        }
        Ok(())
    }
    pub fn send(&mut self, event: &V) -> Result<()> {
        if !event["type"].is_string() {
            return err("INVALID_ARTIFACT", "event type");
        }
        if self.done() {
            return Ok(());
        }
        self.recompute(event)?;
        let name = event["type"].as_str().unwrap();
        let t = self.definition["states"][&self.state]["on"][name].clone();
        let chosen = self.choose(&t, event)?;
        let chosen = match chosen {
            Some(t) => Some(t),
            None => self.choose(&self.definition["on"][name], event)?,
        };
        if let Some(t) = chosen {
            self.transition(&t, event)?;
        }
        self.stabilize(event)?;
        self.recompute(event)
    }
    pub fn done(&self) -> bool {
        self.definition["states"][&self.state]["type"] == "final"
    }
    pub fn snapshot(&self) -> V {
        json!({"state":self.state,"done":self.done(),"store":self.store,"queries":self.queries,"effects":self.effects})
    }
}
pub fn capabilities() -> V {
    json!({"profile":"statepack.native/1","engine":"yexp","bytecodeVersion":1,"supportedOpcodes":[0,1,2,3,10,11,12,13,14,15,20,30,31,32,33,34,35,36,37,40,41,42,43,50,51,52,53,54,55,56,57,60,61,62,63,64,70,71,80,81,82,83,90,91,92,93,100,101,110,111,116,117,130,200],"functions":["length","abs","floor","ceil","round","min","max","toString"],"unsupported":["nested states","parallel states","timers","actors","invoke","async","durable snapshots","spreads","wildcards","descent","lambdas","collection builtins","expression mutation","assign"]})
}
pub fn request(input: &V) -> V {
    let mut r = Registry::default();
    if let Some(reg) = input["registry"].as_object() {
        for (name, kind) in reg {
            if kind == "double" {
                r.register(name, |args| {
                    number(num(args.first().unwrap_or(&V::Null))? * 2.)
                });
            }
        }
    }
    let result = match input["mode"].as_str() {
        Some("expression") => {
            evaluate(&input["expression"], &input["scope"], &r).map(|value| json!({"value":value}))
        }
        Some("machine") => (|| {
            let mut machine = Machine::load(&input["artifact"], &r)?;
            for event in input["events"].as_array().ok_or(Error {
                code: "INVALID_ARTIFACT",
                message: "events array".into(),
            })? {
                machine.send(event)?;
            }
            Ok(machine.snapshot())
        })(),
        Some("capabilities") => Ok(capabilities()),
        _ => err("INVALID_ARTIFACT", "unknown mode"),
    };
    match result {
        Ok(v) => v,
        Err(e) => json!({"error":{"code":e.code,"message":e.message}}),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compiled_counter() {
        let artifact: V =
            serde_json::from_str(include_str!("../../../docs/examples/compiled-counter.json"))
                .unwrap();
        let r = Registry::default();
        let mut m = Machine::load(&artifact, &r).unwrap();
        m.send(&json!({"type":"INCREMENT","amount":3})).unwrap();
        assert_eq!(m.store["counter"]["count"], 3.);
        assert_eq!(m.queries["counter"]["doubled"], 6.);
    }
    #[test]
    fn underflow_is_error() {
        let e = json!({"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":[],"constants":[],"code":[[10],[200]]}});
        assert_eq!(
            evaluate(&e, &json!({}), &Registry::default())
                .unwrap_err()
                .code,
            "INVALID_INSTRUCTION"
        );
    }
}

fn condition_truthy(v: &V) -> bool {
    match v {
        V::Null => false,
        V::Bool(b) => *b,
        V::Number(n) => n.as_f64().unwrap_or(0.) != 0.,
        V::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn js_number(v: &V) -> f64 {
    match v {
        V::Null => 0.,
        V::Bool(b) => {
            if *b {
                1.
            } else {
                0.
            }
        }
        V::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        V::String(s) => {
            if s.trim().is_empty() {
                0.
            } else {
                s.trim().parse().unwrap_or(f64::NAN)
            }
        }
        _ => f64::NAN,
    }
}
fn condition_compare(op: i64, a: &V, b: &V) -> Result<bool> {
    if a.is_array() || a.is_object() || b.is_array() || b.is_object() {
        return err("UNSUPPORTED_FEATURE", "condition collection comparison");
    };
    if op == 36 || op == 37 {
        return Ok(truthy(&binary(op, a.clone(), b.clone())?));
    }
    if op == 30 || op == 31 {
        let eq = if a.is_null() || b.is_null() {
            a.is_null() && b.is_null()
        } else if std::mem::discriminant(a) == std::mem::discriminant(b) {
            if a.is_number() {
                a.as_f64() == b.as_f64()
            } else {
                a == b
            }
        } else {
            js_number(a) == js_number(b)
        };
        return Ok(if op == 31 { !eq } else { eq });
    }
    let ord = if let (Some(a), Some(b)) = (a.as_str(), b.as_str()) {
        Some(a.encode_utf16().cmp(b.encode_utf16()))
    } else {
        js_number(a).partial_cmp(&js_number(b))
    };
    Ok(match op {
        32 => ord == Some(std::cmp::Ordering::Less),
        33 => ord == Some(std::cmp::Ordering::Greater),
        34 => matches!(
            ord,
            Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal)
        ),
        35 => matches!(
            ord,
            Some(std::cmp::Ordering::Greater | std::cmp::Ordering::Equal)
        ),
        _ => false,
    })
}
#[cfg(test)]
mod hardening_tests {
    use super::*;
    fn expr(code: V, constants: V, slots: V) -> V {
        json!({"engine":"yexp","artifactVersion":1,"program":{"version":1,"code":code,"constants":constants,"slots":slots}})
    }
    #[test]
    fn registry_overrides_builtin() {
        let mut r = Registry::default();
        r.register("abs", |_| Ok(json!(123)));
        let e = expr(
            json!([[0, 0], [130, "abs", 1], [200]]),
            json!([-4]),
            json!([]),
        );
        assert_eq!(evaluate(&e, &json!({}), &r).unwrap(), 123);
    }
    #[test]
    fn invalid_jump_and_unknown_function() {
        let r = Registry::default();
        let e = expr(json!([[93, 9]]), json!([]), json!([]));
        assert_eq!(validate(&e, &r).unwrap_err().code, "INVALID_INSTRUCTION");
        let e = expr(json!([[130, "network", 0], [200]]), json!([]), json!([]));
        assert_eq!(validate(&e, &r).unwrap_err().code, "UNKNOWN_FUNCTION");
    }
    #[test]
    fn instruction_budget() {
        let e = expr(json!([[93, 0]]), json!([]), json!([]));
        assert_eq!(
            evaluate(&e, &json!({}), &Registry::default())
                .unwrap_err()
                .code,
            "LIMIT_EXCEEDED"
        );
    }
    #[test]
    fn vm_truthiness_and_guard_truthiness_differ() {
        assert!(truthy(&json!(0)));
        assert!(!condition_truthy(&json!(0)));
        assert!(condition_compare(30, &json!("2"), &json!(2)).unwrap());
        assert!(!condition_compare(36, &json!("2"), &json!(2)).unwrap());
    }
    #[test]
    fn malformed_machine_rejected_before_effects() {
        let mut a: V =
            serde_json::from_str(include_str!("../../../docs/examples/compiled-counter.json"))
                .unwrap();
        a["definition"]["states"]["active"]["invoke"] = json!({});
        let r = Registry::default();
        assert_eq!(
            Machine::load(&a, &r).err().unwrap().code,
            "UNSUPPORTED_FEATURE"
        );
    }
}
#[cfg(test)]
mod registry_contract_tests {
    use super::*;
    #[test]
    fn builtin_arity() {
        let r = Registry::default();
        assert_eq!(
            r.call("abs", &[json!(1), json!(2)]).unwrap_err().code,
            "TYPE_ERROR"
        );
        assert_eq!(r.call("toString", &[]).unwrap_err().code, "TYPE_ERROR");
        assert_eq!(
            r.call("round", &[json!(1), json!(2), json!(3)])
                .unwrap_err()
                .code,
            "TYPE_ERROR"
        );
    }
    #[test]
    fn js_number_format() {
        assert_eq!(js_number_string(1e-7), "1e-7");
        assert_eq!(js_number_string(1e21), "1e+21");
        assert_eq!(js_number_string(-0.), "0");
        assert_eq!(js_number_string(1e-6), "0.000001");
    }
}
#[cfg(test)]
mod scope_merge_tests {
    use super::*;
    #[test]
    fn slice_tables_order_context_then_query() {
        let query = json!({"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":[],"constants":[7],"code":[[0,0],[200]]}});
        let artifact = json!({"format":"statepack.compiled","version":1,"definition":{"id":"collisions","expressionEngine":"yexp","initial":"active","store":{"a":{"context":{"count":10,"shared":2}},"z":{"context":{"count":1},"queries":{"shared":"expr:0"}}},"states":{"active":{}}},"expressions":[],"slices":[{"name":"z","expressions":[["expr:0",query]]},{"name":"a","expressions":[]}]});
        let r = Registry::default();
        let m = Machine::load(&artifact, &r).unwrap();
        assert_eq!(m.flat(), json!({"count":10,"shared":7}));
    }
}
