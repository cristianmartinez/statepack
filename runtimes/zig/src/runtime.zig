const std = @import("std");
pub const Value = std.json.Value;
pub const Failure = error{ TYPE_ERROR, DIVISION_BY_ZERO, INVALID_INSTRUCTION, INVALID_ARTIFACT, UNSUPPORTED_FEATURE, UNKNOWN_FUNCTION, LIMIT_EXCEEDED, OutOfMemory };
pub const Function = *const fn (std.mem.Allocator, []const Value) Failure!Value;
const nil: Value = .null;
fn get(v: Value, k: []const u8) Value {
    return if (v == .object) v.object.get(k) orelse nil else nil;
}
fn str(v: Value) Failure![]const u8 {
    return if (v == .string) v.string else error.INVALID_ARTIFACT;
}
fn num(v: Value) Failure!f64 {
    return switch (v) {
        .integer => @floatFromInt(v.integer),
        .float => v.float,
        .number_string => std.fmt.parseFloat(f64, v.number_string) catch error.TYPE_ERROR,
        else => error.TYPE_ERROR,
    };
}
fn int(v: Value) Failure!i64 {
    const n = try num(v);
    if (!std.math.isFinite(n) or @floor(n) != n or @abs(n) > 2147483647) return error.INVALID_ARTIFACT;
    return @intFromFloat(n);
}
fn truth(v: Value) bool {
    return v != .null and !(v == .bool and !v.bool);
}
fn number(n: f64) Failure!Value {
    if (!std.math.isFinite(n)) return error.TYPE_ERROR;
    return .{ .float = n };
}
fn same(a: []const u8, b: []const u8) bool {
    return std.mem.eql(u8, a, b);
}
fn allowedFields(v: Value, keys: []const []const u8) Failure!void {
    if (v != .object) return error.INVALID_ARTIFACT;
    var it = v.object.iterator();
    while (it.next()) |entry| {
        var found = false;
        for (keys) |key| if (same(entry.key_ptr.*, key)) {
            found = true;
            break;
        };
        if (!found) return error.UNSUPPORTED_FEATURE;
    }
}
fn finiteValue(v: Value) Failure!void {
    switch (v) {
        .float => if (!std.math.isFinite(v.float)) return error.INVALID_ARTIFACT,
        .array => for (v.array.items) |x| try finiteValue(x),
        .object => {
            var it = v.object.iterator();
            while (it.next()) |e| try finiteValue(e.value_ptr.*);
        },
        else => {},
    }
}
pub const Runtime = struct {
    a: std.mem.Allocator,
    registry: std.StringHashMap(Function),
    budget: usize = 100000,
    pub fn init(a: std.mem.Allocator) Runtime {
        return .{ .a = a, .registry = std.StringHashMap(Function).init(a) };
    }
    pub fn register(self: *Runtime, name: []const u8, f: Function) Failure!void {
        try self.registry.put(name, f);
    }
    pub fn object(self: *Runtime, keys: []const []const u8, values: []const Value) Failure!Value {
        var o = std.json.ObjectMap.init(self.a);
        for (keys, values) |k, v| try o.put(k, v);
        return .{ .object = o };
    }
    fn list(self: *Runtime, values: []const Value) Failure!Value {
        var l = std.ArrayList(Value).init(self.a);
        try l.appendSlice(values);
        return .{ .array = l };
    }
    fn text(self: *Runtime, v: Value) Failure![]const u8 {
        return switch (v) {
            .null => "null",
            .bool => if (v.bool) "true" else "false",
            .string => v.string,
            .integer => try self.numberText(@floatFromInt(v.integer)),
            .float => try self.numberText(v.float),
            .object => "[object Object]",
            .array => blk: {
                var s = std.ArrayList(u8).init(self.a);
                for (v.array.items, 0..) |x, i| {
                    if (i > 0) try s.append(',');
                    if (x != .null) try s.appendSlice(try self.text(x));
                }
                break :blk try s.toOwnedSlice();
            },
            else => error.TYPE_ERROR,
        };
    }
    fn numberText(self: *Runtime, n: f64) Failure![]const u8 {
        if (!std.math.isFinite(n)) return error.TYPE_ERROR;
        if (n == 0) return "0";
        if (@abs(n) >= 1e21 or @abs(n) < 1e-6) {
            const scientific = try std.fmt.allocPrint(self.a, "{e}", .{n});
            const e = std.mem.indexOfScalar(u8, scientific, 'e') orelse return scientific;
            if (scientific[e + 1] != '-' and scientific[e + 1] != '+') return std.mem.concat(self.a, u8, &.{ scientific[0 .. e + 1], "+", scientific[e + 1 ..] });
            return scientific;
        }
        return std.fmt.allocPrint(self.a, "{d}", .{n});
    }
    fn access(self: *Runtime, v: Value, key: Value) Failure!Value {
        if (key == .string) {
            if (same(key.string, "__proto__") or same(key.string, "constructor") or same(key.string, "prototype")) return nil;
            if (v == .object) return get(v, key.string);
            if (same(key.string, "length")) {
                if (v == .array) return .{ .integer = @intCast(v.array.items.len) };
                if (v == .string) return .{ .integer = @intCast(try self.utf16Length(v.string)) };
            }
            return nil;
        }
        const idx = int(key) catch return nil;
        if (v == .array) {
            const n: @TypeOf(idx) = @intCast(v.array.items.len);
            const k = if (idx < 0) n + idx else idx;
            return if (k < 0 or k >= n) nil else v.array.items[@intCast(k)];
        }
        if (v == .string) {
            const units = std.unicode.utf8ToUtf16LeAlloc(self.a, v.string) catch return error.TYPE_ERROR;
            const n: i64 = @intCast(units.len);
            const k = if (idx < 0) n + idx else idx;
            if (k < 0 or k >= n) return nil;
            const unit = units[@intCast(k)];
            if (unit >= 0xd800 and unit <= 0xdfff) return error.UNSUPPORTED_FEATURE;
            return .{ .string = std.unicode.utf16LeToUtf8Alloc(self.a, &.{unit}) catch return error.TYPE_ERROR };
        }
        return nil;
    }
    fn utf16Length(self: *Runtime, s: []const u8) Failure!usize {
        return (std.unicode.utf8ToUtf16LeAlloc(self.a, s) catch return error.TYPE_ERROR).len;
    }
    fn path(self: *Runtime, scope: Value, p: []const u8) Failure!Value {
        var i: usize = 0;
        var v = scope;
        if (std.mem.startsWith(u8, p, "$context") or std.mem.startsWith(u8, p, "$env")) return nil;
        if (p.len > 0 and p[0] == '$') i = 1;
        while (i < p.len) {
            if (p[i] == '.') {
                i += 1;
                continue;
            }
            if (p[i] == '[') {
                i += 1;
                const start = i;
                while (i < p.len and p[i] != ']') : (i += 1) {}
                if (i == p.len) return error.INVALID_ARTIFACT;
                const n = std.fmt.parseInt(i64, p[start..i], 10) catch return error.INVALID_ARTIFACT;
                v = try self.access(v, .{ .integer = n });
                i += 1;
            } else {
                const start = i;
                while (i < p.len and p[i] != '.' and p[i] != '[') : (i += 1) {}
                v = try self.access(v, .{ .string = p[start..i] });
            }
        }
        return v;
    }
    fn binary(self: *Runtime, op: i64, a: Value, b: Value) Failure!Value {
        if (op >= 30 and op <= 37) {
            if (a == .array or a == .object or b == .array or b == .object) return error.UNSUPPORTED_FEATURE;
            const equal = if ((a == .integer or a == .float) and (b == .integer or b == .float)) (try num(a)) == (try num(b)) else if (std.meta.activeTag(a) != std.meta.activeTag(b)) false else switch (a) {
                .null => true,
                .bool => a.bool == b.bool,
                .string => same(a.string, b.string),
                else => false,
            };
            if (op == 30 or op == 36) return .{ .bool = equal };
            if (op == 31 or op == 37) return .{ .bool = !equal };
            const order = blk: {
                const x = try num(a);
                const y = try num(b);
                break :blk if (x < y) std.math.Order.lt else if (x > y) std.math.Order.gt else std.math.Order.eq;
            };
            return .{ .bool = switch (op) {
                32 => order == .lt,
                33 => order == .gt,
                34 => order != .gt,
                35 => order != .lt,
                else => false,
            } };
        }
        if (op == 10 and a == .string and b == .string) return .{ .string = try std.mem.concat(self.a, u8, &.{ a.string, b.string }) };
        const x = try num(a);
        const y = try num(b);
        if ((op == 13 or op == 14) and y == 0) return error.DIVISION_BY_ZERO;
        return number(switch (op) {
            10 => x + y,
            11 => x - y,
            12 => x * y,
            13 => x / y,
            14 => @rem(x, y),
            else => return error.INVALID_INSTRUCTION,
        });
    }
    fn call(self: *Runtime, name: []const u8, args: []const Value) Failure!Value {
        if (self.registry.get(name)) |f| {
            const value = try f(self.a, args);
            finiteValue(value) catch return error.TYPE_ERROR;
            return value;
        }
        if (args.len == 0) return error.TYPE_ERROR;
        if (same(name, "round")) {
            if (args.len > 2) return error.TYPE_ERROR;
        } else if (!same(name, "min") and !same(name, "max") and args.len != 1) return error.TYPE_ERROR;
        if (same(name, "length")) {
            const v = args[0];
            return .{ .integer = @intCast(if (v == .array) v.array.items.len else if (v == .string) try self.utf16Length(v.string) else return error.TYPE_ERROR) };
        }
        if (same(name, "toString")) return .{ .string = try self.text(args[0]) };
        const x = try num(args[0]);
        if (same(name, "abs")) return number(@abs(x));
        if (same(name, "floor")) return number(@floor(x));
        if (same(name, "ceil")) return number(@ceil(x));
        if (same(name, "round")) {
            const d = if (args.len > 1) try num(args[1]) else 0;
            const factor = std.math.pow(f64, 10, d);
            return number(@floor(x * factor + 0.5) / factor);
        }
        if (same(name, "min") or same(name, "max")) {
            var result = x;
            for (args[1..]) |arg| {
                const n = try num(arg);
                result = if (same(name, "min")) @min(result, n) else @max(result, n);
            }
            return number(result);
        }
        return error.UNKNOWN_FUNCTION;
    }
    fn known(self: *Runtime, name: []const u8) bool {
        if (self.registry.contains(name)) return true;
        for ([_][]const u8{ "length", "abs", "floor", "ceil", "round", "min", "max", "toString" }) |n| if (same(name, n)) return true;
        return false;
    }
    pub fn validate(self: *Runtime, e: Value) Failure!void {
        if (!same(try str(get(e, "engine")), "yexp") or try int(get(e, "artifactVersion")) != 1) return error.INVALID_ARTIFACT;
        const p = get(e, "program");
        if (try int(get(p, "version")) != 1) return error.INVALID_ARTIFACT;
        const slots = get(p, "slots");
        const constants = get(p, "constants");
        const code = get(p, "code");
        if (slots != .array or constants != .array or code != .array) return error.INVALID_ARTIFACT;
        for (slots.array.items) |s| {
            _ = try str(s);
        }
        for (constants.array.items) |c| {
            try finiteValue(c);
            if (c == .object and ((get(c, "__lambda") == .bool and get(c, "__lambda").bool) or (get(c, "type") == .string and same(get(c, "type").string, "lambda")))) return error.UNSUPPORTED_FEATURE;
        }
        for (code.array.items) |iv| {
            if (iv != .array or iv.array.items.len == 0) return error.INVALID_INSTRUCTION;
            const i = iv.array.items;
            const op = try int(i[0]);
            const arity: usize = switch (op) {
                0, 1, 70, 71, 80...83, 91...93, 100, 101, 110, 111, 116, 117 => 2,
                40...43 => 4,
                50...57, 60...64, 130 => 3,
                2, 3, 10...15, 20, 30...37, 90, 200 => 1,
                else => return error.UNSUPPORTED_FEATURE,
            };
            if (i.len != arity) return error.INVALID_INSTRUCTION;
            if (op == 1 or (op >= 40 and op <= 83)) {
                const s = try int(i[1]);
                if (s < 0 or s >= slots.array.items.len) return error.INVALID_INSTRUCTION;
            }
            if (op == 0) {
                const c = try int(i[1]);
                if (c < 0 or c >= constants.array.items.len) return error.INVALID_INSTRUCTION;
            }
            if (op >= 91 and op <= 93) {
                const t = try int(i[1]);
                if (t < 0 or t >= code.array.items.len) return error.INVALID_INSTRUCTION;
            }
            if (op == 100 or op == 101 or op == 130) {
                const count = try int(i[if (op == 130) 2 else 1]);
                if (count < 0) return error.INVALID_INSTRUCTION;
            }
            if (op == 116) {
                _ = try str(i[1]);
            }
            if (op == 110 or op == 111 or op == 117) {
                _ = try int(i[1]);
            }
            if (op == 130 and !self.known(try str(i[1]))) return error.UNKNOWN_FUNCTION;
        }
    }
    pub fn evaluate(self: *Runtime, e: Value, scope: Value) Failure!Value {
        try self.validate(e);
        const p = get(e, "program");
        const slots = get(p, "slots").array.items;
        const constants = get(p, "constants").array.items;
        const code = get(p, "code").array.items;
        var stack = std.ArrayList(Value).init(self.a);
        var pc: usize = 0;
        var remaining = self.budget;
        while (pc < code.len) {
            if (remaining == 0) return error.LIMIT_EXCEEDED;
            remaining -= 1;
            const i = code[pc].array.items;
            const op = try int(i[0]);
            pc += 1;
            switch (op) {
                0 => try stack.append(constants[@intCast(try int(i[1]))]),
                1 => try stack.append(try self.path(scope, try str(slots[@intCast(try int(i[1]))]))),
                2 => {
                    if (stack.items.len == 0) return error.INVALID_INSTRUCTION;
                    try stack.append(stack.items[stack.items.len - 1]);
                },
                3 => {
                    _ = stack.pop() orelse return error.INVALID_INSTRUCTION;
                },
                10...14, 30...37 => {
                    const b = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    const a = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    try stack.append(try self.binary(op, a, b));
                },
                15 => {
                    const v = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    try stack.append(try number(-(try num(v))));
                },
                20 => {
                    const v = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    try stack.append(.{ .string = try self.text(v) });
                },
                40...43 => {
                    const v = try num(try self.path(scope, try str(slots[@intCast(try int(i[1]))])));
                    const lo = try num(i[2]);
                    const hi = try num(i[3]);
                    try stack.append(.{ .bool = (if (op == 40 or op == 42) v >= lo else v > lo) and (if (op == 40 or op == 43) v <= hi else v < hi) });
                },
                50...57 => {
                    const ops = [_]i64{ 33, 35, 32, 34, 30, 31, 36, 37 };
                    try stack.append(try self.binary(ops[@intCast(op - 50)], try self.path(scope, try str(slots[@intCast(try int(i[1]))])), i[2]));
                },
                60...64 => try stack.append(try self.binary(op - 50, try self.path(scope, try str(slots[@intCast(try int(i[1]))])), i[2])),
                70, 71 => try stack.append(try self.binary(if (op == 70) 10 else 11, try self.path(scope, try str(slots[@intCast(try int(i[1]))])), .{ .integer = 1 })),
                80...83 => {
                    const v = try self.path(scope, try str(slots[@intCast(try int(i[1]))]));
                    try stack.append(.{ .bool = switch (op) {
                        80 => v == .null,
                        81 => v != .null,
                        82 => truth(v),
                        else => !truth(v),
                    } });
                },
                90 => {
                    const v = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    try stack.append(.{ .bool = !truth(v) });
                },
                91, 92 => {
                    const v = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    if (truth(v) == (op == 92)) pc = @intCast(try int(i[1]));
                },
                93 => pc = @intCast(try int(i[1])),
                100 => {
                    const n = try int(i[1]);
                    if (n < 0 or n > stack.items.len) return error.INVALID_INSTRUCTION;
                    const start = stack.items.len - @as(usize, @intCast(n));
                    const v = try self.list(stack.items[start..]);
                    stack.shrinkRetainingCapacity(start);
                    try stack.append(v);
                },
                101 => {
                    const n = try int(i[1]);
                    if (n < 0 or n * 2 > stack.items.len) return error.INVALID_INSTRUCTION;
                    var o = std.json.ObjectMap.init(self.a);
                    const start = stack.items.len - @as(usize, @intCast(n * 2));
                    var j = start;
                    while (j < stack.items.len) : (j += 2) {
                        const key = try str(stack.items[j]);
                        if (same(key, "__proto__") or same(key, "constructor") or same(key, "prototype")) continue;
                        try o.put(key, stack.items[j + 1]);
                    }
                    stack.shrinkRetainingCapacity(start);
                    try stack.append(.{ .object = o });
                },
                110, 111, 117 => {
                    const key = if (try int(i[1]) == -1) stack.pop() orelse return error.INVALID_INSTRUCTION else i[1];
                    const v = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    try stack.append(try self.access(v, key));
                },
                116 => {
                    const v = stack.pop() orelse return error.INVALID_INSTRUCTION;
                    try stack.append(try self.access(v, i[1]));
                },
                130 => {
                    const n = try int(i[2]);
                    if (n < 0 or n > stack.items.len) return error.INVALID_INSTRUCTION;
                    const start = stack.items.len - @as(usize, @intCast(n));
                    const v = try self.call(try str(i[1]), stack.items[start..]);
                    stack.shrinkRetainingCapacity(start);
                    try stack.append(v);
                },
                200 => return stack.pop() orelse nil,
                else => return error.UNSUPPORTED_FEATURE,
            }
        }
        return error.INVALID_INSTRUCTION;
    }
    pub fn request(self: *Runtime, r: Value) Failure!Value {
        const registry = get(r, "registry");
        if (registry == .object) {
            var it = registry.object.iterator();
            while (it.next()) |e| {
                if (!same(try str(e.value_ptr.*), "double")) return error.UNSUPPORTED_FEATURE;
                try self.register(e.key_ptr.*, double);
            }
        }
        const mode = try str(get(r, "mode"));
        if (same(mode, "expression")) return self.object(&.{"value"}, &.{try self.evaluate(get(r, "expression"), get(r, "scope"))});
        if (same(mode, "machine")) {
            var machine = try Machine.init(self, get(r, "artifact"));
            return machine.run(get(r, "events"));
        }
        if (same(mode, "capabilities")) {
            var functions = try self.list(&.{});
            for ([_][]const u8{ "length", "abs", "floor", "ceil", "round", "min", "max", "toString" }) |name| try functions.array.append(.{ .string = name });
            var opcodes = try self.list(&.{});
            for ([_]i64{ 0, 1, 2, 3, 10, 11, 12, 13, 14, 15, 20, 30, 31, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43, 50, 51, 52, 53, 54, 55, 56, 57, 60, 61, 62, 63, 64, 70, 71, 80, 81, 82, 83, 90, 91, 92, 93, 100, 101, 110, 111, 116, 117, 130, 200 }) |op| try opcodes.array.append(.{ .integer = op });
            return self.object(&.{ "profile", "language", "bytecodeVersion", "functions", "supportedOpcodes", "unsupported" }, &.{ .{ .string = "statepack.native/1" }, .{ .string = "zig" }, .{ .integer = 1 }, functions, opcodes, try self.list(&.{ .{ .string = "nested/parallel states" }, .{ .string = "timers/invoke/actors" }, .{ .string = "lambda/collection/spread/mutation bytecode" }, .{ .string = "durable snapshots" }, .{ .string = "lone UTF-16 surrogate indexing" } }) });
        }
        return error.INVALID_ARTIFACT;
    }
};
fn double(_: std.mem.Allocator, args: []const Value) Failure!Value {
    if (args.len != 1) return error.TYPE_ERROR;
    return number((try num(args[0])) * 2);
}
pub const Machine = struct {
    rt: *Runtime,
    definition: Value,
    artifact: Value,
    state: []const u8,
    store: Value,
    queries: Value,
    effects: Value,
    steps: usize = 0,
    pub fn init(rt: *Runtime, a: Value) Failure!Machine {
        if (!same(try str(get(a, "format")), "statepack.compiled") or try int(get(a, "version")) != 1) return error.INVALID_ARTIFACT;
        var d = get(a, "definition");
        if (d == .object and get(d, "store") == .null) try d.object.put("store", try rt.object(&.{}, &.{}));
        try allowedFields(d, &.{ "id", "expressionEngine", "initial", "store", "states", "on", "actions", "guards", "meta", "version" });
        if (get(d, "store") != .object) return error.INVALID_ARTIFACT;
        if (!same(try str(get(d, "expressionEngine")), "yexp")) return error.UNSUPPORTED_FEATURE;
        const states = get(d, "states");
        if (states != .object) return error.INVALID_ARTIFACT;
        const initial = try str(get(d, "initial"));
        if (get(states, initial) == .null) return error.INVALID_ARTIFACT;
        var m = Machine{ .rt = rt, .definition = d, .artifact = a, .state = initial, .store = try rt.object(&.{}, &.{}), .queries = try rt.object(&.{}, &.{}), .effects = try rt.list(&.{}) };
        const slices = get(a, "slices");
        if (slices != .array or get(a, "expressions") != .array) return error.INVALID_ARTIFACT;
        for (get(a, "expressions").array.items, 0..) |pair, index| {
            try m.validatePair(pair);
            for (get(a, "expressions").array.items[0..index]) |old| if (same(try str(old.array.items[0]), try str(pair.array.items[0]))) return error.INVALID_ARTIFACT;
        }
        for (slices.array.items) |slice| {
            if (slice == .object and slice.object.contains("sources")) return error.UNSUPPORTED_FEATURE;
            const name = try str(get(slice, "name"));
            if (m.store.object.contains(name)) return error.INVALID_ARTIFACT;
            const ds = get(get(d, "store"), name);
            if (ds == .null) return error.INVALID_ARTIFACT;
            if (ds == .object and ds.object.contains("sources")) return error.UNSUPPORTED_FEATURE;
            try m.store.object.put(name, get(ds, "context"));
            try m.queries.object.put(name, try rt.object(&.{}, &.{}));
            const es = get(slice, "expressions");
            if (es != .array) return error.INVALID_ARTIFACT;
            for (es.array.items, 0..) |p, index| {
                try m.validatePair(p);
                for (es.array.items[0..index]) |old| if (same(try str(old.array.items[0]), try str(p.array.items[0]))) return error.INVALID_ARTIFACT;
            }
            const mutations = get(ds, "mutations");
            if (mutations != .null) {
                if (mutations != .object) return error.INVALID_ARTIFACT;
                var mi = mutations.object.iterator();
                while (mi.next()) |mutation| {
                    if (mutation.value_ptr.* != .object) return error.INVALID_ARTIFACT;
                    var fi = mutation.value_ptr.object.iterator();
                    while (fi.next()) |f| {
                        _ = try m.expression(name, try str(f.value_ptr.*));
                    }
                }
            }
        }
        if (m.store.object.count() != get(d, "store").object.count()) return error.INVALID_ARTIFACT;
        var it = states.object.iterator();
        while (it.next()) |e| {
            const st = e.value_ptr.*;
            if (st != .object) return error.INVALID_ARTIFACT;
            try allowedFields(st, &.{ "type", "on", "always", "entry", "exit", "meta", "tags", "description", "id" });
            var fields = st.object.iterator();
            while (fields.next()) |f| {
                const k = f.key_ptr.*;
                if (same(k, "states") or same(k, "after") or same(k, "invoke") or same(k, "initial")) return error.UNSUPPORTED_FEATURE;
                if (same(k, "type") and !same(try str(f.value_ptr.*), "atomic") and !same(try str(f.value_ptr.*), "final")) return error.UNSUPPORTED_FEATURE;
            }
            try m.validateTransitions(get(st, "on"), true);
            try m.validateTransitions(get(st, "always"), false);
            try m.validateActions(get(st, "entry"), 0);
            try m.validateActions(get(st, "exit"), 0);
        }
        const namedActions = get(d, "actions");
        if (namedActions != .null) {
            if (namedActions != .object) return error.INVALID_ARTIFACT;
            var ai = namedActions.object.iterator();
            while (ai.next()) |action| try m.validateActions(action.value_ptr.*, 0);
        }
        const namedGuards = get(d, "guards");
        if (namedGuards != .null) {
            if (namedGuards != .object) return error.INVALID_ARTIFACT;
            var gi = namedGuards.object.iterator();
            while (gi.next()) |guardDef| try m.validateGuard(guardDef.value_ptr.*, 0);
        }
        try m.validateTransitions(get(d, "on"), true);
        try m.refresh();
        return m;
    }
    fn validatePair(self: *Machine, p: Value) Failure!void {
        if (p != .array or p.array.items.len != 2) return error.INVALID_ARTIFACT;
        _ = try str(p.array.items[0]);
        try self.rt.validate(p.array.items[1]);
    }
    fn expression(self: *Machine, slice: []const u8, id: []const u8) Failure!Value {
        const table = if (slice.len == 0) get(self.artifact, "expressions") else blk: {
            for (get(self.artifact, "slices").array.items) |s| if (same(try str(get(s, "name")), slice)) break :blk get(s, "expressions");
            return error.INVALID_ARTIFACT;
        };
        for (table.array.items) |p| if (same(try str(p.array.items[0]), id)) return p.array.items[1];
        return error.INVALID_ARTIFACT;
    }
    fn validateTransitions(self: *Machine, t: Value, on: bool) Failure!void {
        if (t == .null) return;
        if (on) {
            if (t != .object) return error.INVALID_ARTIFACT;
            var it = t.object.iterator();
            while (it.next()) |e| try self.validateTransitions(e.value_ptr.*, false);
            return;
        }
        if (t == .array) {
            for (t.array.items) |x| try self.validateTransitions(x, false);
            return;
        }
        if (t == .string) {
            if (get(get(self.definition, "states"), t.string) == .null) return error.INVALID_ARTIFACT;
            return;
        }
        if (t != .object) return error.INVALID_ARTIFACT;
        try allowedFields(t, &.{ "target", "actions", "guard", "internal", "meta", "description" });
        const target = get(t, "target");
        if (target != .null and (target != .string or get(get(self.definition, "states"), target.string) == .null)) return error.INVALID_ARTIFACT;
        try self.validateActions(get(t, "actions"), 0);
        try self.validateGuard(get(t, "guard"), 0);
    }
    fn validateActions(self: *Machine, a: Value, depth: usize) Failure!void {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (a == .null) return;
        if (a == .array) {
            for (a.array.items) |x| try self.validateActions(x, depth + 1);
            return;
        }
        if (a == .string) {
            const named = get(get(self.definition, "actions"), a.string);
            if (named == .null) return error.INVALID_ARTIFACT;
            return self.validateActions(named, depth + 1);
        }
        if (a == .object and a.object.contains("condition")) return error.UNSUPPORTED_FEATURE;
        const ty = try str(get(a, "type"));
        if (same(ty, "mutation")) {
            const name = try str(get(a, "name"));
            var parts = std.mem.splitScalar(u8, name, '.');
            const first = parts.next().?;
            const second = parts.next();
            const slice = if (second != null) first else if (self.store.object.count() == 1) self.store.object.keys()[0] else return error.INVALID_ARTIFACT;
            const mutation = if (second) |n| n else first;
            const fields = get(get(get(get(self.definition, "store"), slice), "mutations"), mutation);
            if (fields != .object) return error.INVALID_ARTIFACT;
            var fi = fields.object.iterator();
            while (fi.next()) |f| {
                _ = try self.expression(slice, try str(f.value_ptr.*));
            }
        }
        if (!same(ty, "mutation") and !same(ty, "log") and !same(ty, "host.event")) return error.UNSUPPORTED_FEATURE;
        if (!same(ty, "mutation")) try self.validateReferences(a, 0);
    }
    fn validateGuard(self: *Machine, g: Value, depth: usize) Failure!void {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (g == .null) return;
        if (g == .string) {
            const n = get(get(self.definition, "guards"), g.string);
            if (n == .null) return error.INVALID_ARTIFACT;
            return self.validateGuard(n, depth + 1);
        }
        if (get(g, "condition") != .null) return self.validateCondition(get(g, "condition"), depth + 1);
        for ([_][]const u8{ "and", "or" }) |k| {
            const cs = get(g, k);
            if (cs == .array) {
                for (cs.array.items) |c| try self.validateGuard(c, depth + 1);
                return;
            }
        }
        if (get(g, "not") != .null) return self.validateGuard(get(g, "not"), depth + 1);
        return error.UNSUPPORTED_FEATURE;
    }
    fn validateCondition(self: *Machine, c: Value, depth: usize) Failure!void {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (c == .bool or c == .string) return;
        const ty = try str(get(c, "type"));
        if (same(ty, "truthy")) {
            _ = try str(get(c, "path"));
            return;
        }
        if (same(ty, "literal")) return;
        if (same(ty, "compare")) {
            _ = try str(get(c, "op"));
            for ([_][]const u8{ "left", "right" }) |key| {
                const v = get(c, key);
                if (v == .object) {
                    const vt = try str(get(v, "type"));
                    if (!same(vt, "ref") and !same(vt, "literal")) return error.UNSUPPORTED_FEATURE;
                }
            }
            return;
        }
        if (same(ty, "not")) return self.validateCondition(get(c, "condition"), depth + 1);
        if (same(ty, "and") or same(ty, "or")) {
            const cs = get(c, "conditions");
            if (cs != .array) return error.INVALID_ARTIFACT;
            for (cs.array.items) |x| try self.validateCondition(x, depth + 1);
            return;
        }
        return error.UNSUPPORTED_FEATURE;
    }
    fn validateReferences(self: *Machine, v: Value, depth: usize) Failure!void {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (v == .string and std.mem.startsWith(u8, v.string, "expr:")) {
            _ = try self.expression("", v.string);
            return;
        }
        if (v == .array) {
            for (v.array.items) |x| try self.validateReferences(x, depth + 1);
        }
        if (v == .object) {
            var it = v.object.iterator();
            while (it.next()) |e| try self.validateReferences(e.value_ptr.*, depth + 1);
        }
    }
    fn globalScope(self: *Machine, event: Value) Failure!Value {
        var context = try self.rt.object(&.{}, &.{});
        var it = self.store.object.iterator();
        while (it.next()) |s| {
            if (s.value_ptr.* == .object) {
                var fields = s.value_ptr.object.iterator();
                while (fields.next()) |f| try context.object.put(f.key_ptr.*, f.value_ptr.*);
            }
        }
        it = self.store.object.iterator();
        while (it.next()) |s| {
            const q = get(self.queries, s.key_ptr.*);
            if (q == .object) {
                var fields = q.object.iterator();
                while (fields.next()) |f| try context.object.put(f.key_ptr.*, f.value_ptr.*);
            }
        }
        return self.rt.object(&.{ "context", "event" }, &.{ context, event });
    }
    fn localScope(self: *Machine, slice: []const u8, event: Value) Failure!Value {
        var context = try self.rt.object(&.{}, &.{});
        const data = get(self.store, slice);
        if (data == .object) {
            var it = data.object.iterator();
            while (it.next()) |e| try context.object.put(e.key_ptr.*, e.value_ptr.*);
        }
        const q = get(self.queries, slice);
        if (q == .object) {
            var it = q.object.iterator();
            while (it.next()) |e| try context.object.put(e.key_ptr.*, e.value_ptr.*);
        }
        return self.rt.object(&.{ "context", "event", "queries", "$context", "$root" }, &.{ context, event, q, self.store, self.store });
    }
    fn refresh(self: *Machine) Failure!void {
        var it = get(self.definition, "store").object.iterator();
        while (it.next()) |s| {
            const defs = get(s.value_ptr.*, "queries");
            if (defs == .null) continue;
            if (defs != .object) return error.INVALID_ARTIFACT;
            var completed = std.StringHashMap(void).init(self.rt.a);
            while (completed.count() < defs.object.count()) {
                var progress = false;
                var qi = defs.object.iterator();
                while (qi.next()) |q| {
                    if (completed.contains(q.key_ptr.*)) continue;
                    const e = try self.expression(s.key_ptr.*, try str(q.value_ptr.*));
                    var ready = true;
                    for (get(get(e, "program"), "slots").array.items) |slot| {
                        const path = try str(slot);
                        for ([_][]const u8{ "$.context.", "$.queries." }) |prefix| {
                            if (std.mem.startsWith(u8, path, prefix)) {
                                const rest = path[prefix.len..];
                                const end = std.mem.indexOfAny(u8, rest, ".[") orelse rest.len;
                                const dependency = rest[0..end];
                                if (defs.object.contains(dependency) and !completed.contains(dependency)) ready = false;
                            }
                        }
                    }
                    if (!ready) continue;
                    const value = try self.rt.evaluate(e, try self.localScope(s.key_ptr.*, nil));
                    try self.queries.object.getPtr(s.key_ptr.*).?.object.put(q.key_ptr.*, value);
                    try completed.put(q.key_ptr.*, {});
                    progress = true;
                }
                if (!progress) return error.INVALID_ARTIFACT;
            }
        }
    }
    fn operand(self: *Machine, v: Value, scope: Value) Failure!Value {
        if (v != .object) return v;
        const ty = try str(get(v, "type"));
        if (same(ty, "literal")) return get(v, "value");
        if (same(ty, "ref")) return self.rt.path(scope, try str(get(v, "path")));
        return error.UNSUPPORTED_FEATURE;
    }
    fn jsTruth(v: Value) bool {
        return switch (v) {
            .null => false,
            .bool => v.bool,
            .integer => v.integer != 0,
            .float => v.float != 0,
            .string => v.string.len != 0,
            else => true,
        };
    }
    fn coerceNumber(v: Value) ?f64 {
        return switch (v) {
            .integer => @floatFromInt(v.integer),
            .float => v.float,
            .bool => if (v.bool) 1 else 0,
            .null => 0,
            .string => blk: {
                const t = std.mem.trim(u8, v.string, " \t\r\n");
                if (t.len == 0) break :blk 0;
                break :blk std.fmt.parseFloat(f64, t) catch null;
            },
            else => null,
        };
    }
    fn condition(self: *Machine, c: Value, scope: Value, depth: usize) Failure!bool {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (c == .bool) return c.bool;
        if (c == .string) return jsTruth(try self.rt.path(scope, c.string));
        const ty = try str(get(c, "type"));
        if (same(ty, "truthy")) return jsTruth(try self.rt.path(scope, try str(get(c, "path"))));
        if (same(ty, "literal")) return jsTruth(get(c, "value"));
        if (same(ty, "compare")) {
            const op = try str(get(c, "op"));
            const ops = [_][]const u8{ "==", "!=", "<", ">", "<=", ">=", "===", "!==" };
            for (ops, 0..) |o, i| if (same(o, op)) {
                const left = try self.operand(get(c, "left"), scope);
                const right = try self.operand(get(c, "right"), scope);
                if (i < 2 and std.meta.activeTag(left) != std.meta.activeTag(right)) {
                    var eq = false;
                    if (left != .null and right != .null) {
                        const ln = coerceNumber(left);
                        const rn = coerceNumber(right);
                        if (ln != null and rn != null) eq = ln.? == rn.?;
                    }
                    return if (i == 0) eq else !eq;
                }
                if (i >= 2 and i <= 5 and left == .string and right == .string) {
                    const order = std.mem.order(u16, std.unicode.utf8ToUtf16LeAlloc(self.rt.a, left.string) catch return error.TYPE_ERROR, std.unicode.utf8ToUtf16LeAlloc(self.rt.a, right.string) catch return error.TYPE_ERROR);
                    return switch (i) {
                        2 => order == .lt,
                        3 => order == .gt,
                        4 => order != .gt,
                        else => order != .lt,
                    };
                }
                if (i >= 2 and i <= 5) {
                    if (left == .array or left == .object or right == .array or right == .object) return error.UNSUPPORTED_FEATURE;
                    const ln = coerceNumber(left) orelse return false;
                    const rn = coerceNumber(right) orelse return false;
                    return (try self.rt.binary(@as(i64, @intCast(i)) + 30, .{ .float = ln }, .{ .float = rn })).bool;
                }
                return (try self.rt.binary(@as(i64, @intCast(i)) + 30, left, right)).bool;
            };
            return error.UNSUPPORTED_FEATURE;
        }
        if (same(ty, "not")) return !(try self.condition(get(c, "condition"), scope, depth + 1));
        if (same(ty, "and") or same(ty, "or")) {
            const cs = get(c, "conditions");
            if (cs != .array) return error.INVALID_ARTIFACT;
            for (cs.array.items) |x| {
                const b = try self.condition(x, scope, depth + 1);
                if (b == same(ty, "or")) return b;
            }
            return same(ty, "and");
        }
        return error.UNSUPPORTED_FEATURE;
    }
    fn guard(self: *Machine, g: Value, scope: Value, depth: usize) Failure!bool {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (g == .null) return true;
        if (g == .string) {
            const named = get(get(self.definition, "guards"), g.string);
            if (named == .null) return error.INVALID_ARTIFACT;
            return self.guard(named, scope, depth + 1);
        }
        if (get(g, "condition") != .null) return self.condition(get(g, "condition"), scope, depth + 1);
        for ([_][]const u8{ "and", "or" }) |op| {
            const cs = get(g, op);
            if (cs == .array) {
                for (cs.array.items) |c| {
                    const b = try self.guard(c, scope, depth + 1);
                    if (b == same(op, "or")) return b;
                }
                return same(op, "and");
            }
        }
        if (get(g, "not") != .null) return !(try self.guard(get(g, "not"), scope, depth + 1));
        return error.UNSUPPORTED_FEATURE;
    }
    fn resolve(self: *Machine, v: Value, event: Value) Failure!Value {
        if (v == .string and std.mem.startsWith(u8, v.string, "expr:")) return self.rt.evaluate(try self.expression("", v.string), try self.globalScope(event));
        if (v == .array) {
            var out = try self.rt.list(&.{});
            for (v.array.items) |x| try out.array.append(try self.resolve(x, event));
            return out;
        }
        if (v == .object) {
            var out = try self.rt.object(&.{}, &.{});
            var it = v.object.iterator();
            while (it.next()) |e| try out.object.put(e.key_ptr.*, try self.resolve(e.value_ptr.*, event));
            return out;
        }
        return v;
    }
    fn actions(self: *Machine, a: Value, event: Value, depth: usize) Failure!void {
        if (depth > 100) return error.LIMIT_EXCEEDED;
        if (a == .null) return;
        if (a == .array) {
            for (a.array.items) |x| try self.actions(x, event, depth + 1);
            return;
        }
        if (a == .string) return self.actions(get(get(self.definition, "actions"), a.string), event, depth + 1);
        const ty = try str(get(a, "type"));
        if (same(ty, "mutation")) {
            const name = try str(get(a, "name"));
            var parts = std.mem.splitScalar(u8, name, '.');
            const first = parts.next().?;
            const second = parts.next();
            const slice = if (second != null) first else if (self.store.object.count() == 1) self.store.object.keys()[0] else return error.INVALID_ARTIFACT;
            const mutation = if (second) |s| s else first;
            const fields = get(get(get(get(self.definition, "store"), slice), "mutations"), mutation);
            if (fields != .object) return error.INVALID_ARTIFACT;
            var ev = event;
            if (ev != .object) ev = try self.rt.object(&.{}, &.{});
            const payload = get(a, "payload");
            if (payload == .object) {
                var pi = payload.object.iterator();
                while (pi.next()) |p| try ev.object.put(p.key_ptr.*, p.value_ptr.*);
            }
            const scope = try self.localScope(slice, ev);
            var updates = try self.rt.object(&.{}, &.{});
            var fi = fields.object.iterator();
            while (fi.next()) |f| try updates.object.put(f.key_ptr.*, try self.rt.evaluate(try self.expression(slice, try str(f.value_ptr.*)), scope));
            var next = try self.rt.object(&.{}, &.{});
            const prior = get(self.store, slice);
            if (prior == .object) {
                var old = prior.object.iterator();
                while (old.next()) |e| try next.object.put(e.key_ptr.*, e.value_ptr.*);
            }
            var ui = updates.object.iterator();
            while (ui.next()) |e| try next.object.put(e.key_ptr.*, e.value_ptr.*);
            try self.store.object.put(slice, next);
            try self.refresh();
            return;
        }
        try self.effects.array.append(try self.rt.object(&.{ "type", "params" }, &.{ .{ .string = ty }, try self.resolve(a, event) }));
    }
    fn select(self: *Machine, t: Value, event: Value) Failure!Value {
        if (t == .array) {
            for (t.array.items) |x| {
                const found = try self.select(x, event);
                if (found != .null) return found;
            }
            return nil;
        }
        if (t == .string) return self.rt.object(&.{"target"}, &.{t});
        if (t == .object and try self.guard(get(t, "guard"), try self.globalScope(event), 0)) return t;
        return nil;
    }
    fn transition(self: *Machine, t: Value, event: Value) Failure!void {
        self.steps += 1;
        if (self.steps > 1000) return error.LIMIT_EXCEEDED;
        const target = get(t, "target");
        const internal = get(t, "internal");
        const change = target == .string and !(internal == .bool and internal.bool);
        if (change) try self.actions(get(get(get(self.definition, "states"), self.state), "exit"), event, 0);
        try self.actions(get(t, "actions"), event, 0);
        if (target == .string) self.state = target.string;
        if (change) try self.actions(get(get(get(self.definition, "states"), self.state), "entry"), event, 0);
    }
    fn done(self: *Machine) bool {
        const ty = get(get(get(self.definition, "states"), self.state), "type");
        return ty == .string and same(ty.string, "final");
    }
    fn stabilize(self: *Machine, event: Value) Failure!void {
        while (!self.done()) {
            const t = try self.select(get(get(get(self.definition, "states"), self.state), "always"), event);
            if (t == .null) return;
            try self.transition(t, event);
        }
    }
    pub fn run(self: *Machine, events: Value) Failure!Value {
        if (events != .array) return error.INVALID_ARTIFACT;
        const initEvent = try self.rt.object(&.{"type"}, &.{.{ .string = "xstate.init" }});
        try self.actions(get(get(get(self.definition, "states"), self.state), "entry"), initEvent, 0);
        try self.stabilize(initEvent);
        for (events.array.items) |event| {
            if (self.done()) break;
            try self.refresh();
            const ty = try str(get(event, "type"));
            var t = try self.select(get(get(get(get(self.definition, "states"), self.state), "on"), ty), event);
            if (t == .null) t = try self.select(get(get(self.definition, "on"), ty), event);
            if (t != .null) try self.transition(t, event);
            try self.stabilize(event);
            try self.refresh();
        }
        return self.rt.object(&.{ "state", "done", "store", "queries", "effects" }, &.{ .{ .string = self.state }, .{ .bool = self.done() }, self.store, self.queries, self.effects });
    }
};
test "registry and compiled arithmetic" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    const p = try std.json.parseFromSlice(Value, a, "{\"engine\":\"yexp\",\"artifactVersion\":1,\"program\":{\"version\":1,\"slots\":[],\"constants\":[3],\"code\":[[0,0],[130,\"double\",1],[200]]}}", .{});
    try rt.register("double", double);
    try std.testing.expectEqual(@as(f64, 6), try num(try rt.evaluate(p.value, nil)));
}

test "instruction validation rejects malformed constants before evaluation" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    const parsed = try std.json.parseFromSlice(Value, a,
        \\{"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":[],"constants":[],"code":[[0,2],[200]]}}
    , .{});
    try std.testing.expectError(error.INVALID_INSTRUCTION, rt.evaluate(parsed.value, nil));
}

test "VM budget stops looping bytecode" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    rt.budget = 3;
    const parsed = try std.json.parseFromSlice(Value, a,
        \\{"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":[],"constants":[],"code":[[93,0]]}}
    , .{});
    try std.testing.expectError(error.LIMIT_EXCEEDED, rt.evaluate(parsed.value, nil));
}

test "query dependency cycles fail during machine load" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    const parsed = try std.json.parseFromSlice(Value, a,
        \\{"format":"statepack.compiled","version":1,"definition":{"id":"cycle","expressionEngine":"yexp","initial":"a","states":{"a":{}},"store":{"s":{"context":{},"queries":{"q":"expr:0"}}}},"expressions":[],"slices":[{"name":"s","expressions":[["expr:0",{"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":["$.context.q"],"constants":[],"code":[[1,0],[200]]}}]]}]}
    , .{});
    try std.testing.expectError(error.INVALID_ARTIFACT, Machine.init(&rt, parsed.value));
}

test "instruction budget resets for each expression evaluation" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    rt.budget = 2;
    const parsed = try std.json.parseFromSlice(Value, a,
        \\{"engine":"yexp","artifactVersion":1,"program":{"version":1,"slots":[],"constants":[1],"code":[[0,0],[200]]}}
    , .{});
    _ = try rt.evaluate(parsed.value, nil);
    _ = try rt.evaluate(parsed.value, nil);
    try std.testing.expectEqual(@as(usize, 2), rt.budget);
}

test "native profile rejects source slices and conditional actions" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    const source = try std.json.parseFromSlice(Value, a,
        \\{"format":"statepack.compiled","version":1,"definition":{"expressionEngine":"yexp","initial":"a","states":{"a":{}},"store":{"s":{"context":{},"sources":{}}}},"expressions":[],"slices":[{"name":"s","expressions":[]}]}
    , .{});
    try std.testing.expectError(error.UNSUPPORTED_FEATURE, Machine.init(&rt, source.value));
    const conditional = try std.json.parseFromSlice(Value, a,
        \\{"format":"statepack.compiled","version":1,"definition":{"expressionEngine":"yexp","initial":"a","states":{"a":{"entry":{"type":"log","condition":true,"message":"bad"}}}},"expressions":[],"slices":[]}
    , .{});
    try std.testing.expectError(error.UNSUPPORTED_FEATURE, Machine.init(&rt, conditional.value));
}

test "ordered scalar guard coercion and flattened query precedence" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var rt = Runtime.init(a);
    const parsed = try std.json.parseFromSlice(Value, a,
        \\{"format":"statepack.compiled","version":1,"definition":{"expressionEngine":"yexp","initial":"a","states":{"a":{}},"store":{"first":{"context":{"x":1}},"second":{"context":{"x":2}}}},"expressions":[],"slices":[{"name":"first","expressions":[]},{"name":"second","expressions":[]}]}
    , .{});
    var machine = try Machine.init(&rt, parsed.value);
    try machine.queries.object.getPtr("first").?.object.put("x", .{ .integer = 3 });
    const scope = try machine.globalScope(try rt.object(&.{"amount"}, &.{.{ .integer = 3 }}));
    try std.testing.expectEqual(@as(i64, 3), get(get(scope, "context"), "x").integer);
    const guard = try std.json.parseFromSlice(Value, a,
        \\{"type":"compare","op":">","left":{"type":"ref","path":"event.amount"},"right":"2"}
    , .{});
    try std.testing.expect(try machine.condition(guard.value, scope, 0));
}
