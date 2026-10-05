const std = @import("std");
const rt = @import("runtime.zig");
pub fn main() !void {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const input = try std.io.getStdIn().reader().readAllAlloc(a, 16 * 1024 * 1024);
    const parsed = std.json.parseFromSlice(std.json.Value, a, input, .{ .allocate = .alloc_always }) catch {
        try std.io.getStdOut().writer().writeAll("{\"error\":{\"code\":\"INVALID_ARTIFACT\",\"message\":\"invalid JSON\"}}\n");
        return;
    };
    var runtime = rt.Runtime.init(a);
    const result = runtime.request(parsed.value) catch |err| blk: {
        const code = @errorName(err);
        break :blk try runtime.object(&.{"error"}, &.{try runtime.object(&.{ "code", "message" }, &.{ .{ .string = code }, .{ .string = code } })});
    };
    try std.json.stringify(result, .{}, std.io.getStdOut().writer());
    try std.io.getStdOut().writer().writeByte('\n');
}
