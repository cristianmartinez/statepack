const std = @import("std");
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const exe = b.addExecutable(.{ .name = "statepack-zig", .root_source_file = b.path("src/main.zig"), .target = target, .optimize = optimize });
    b.installArtifact(exe);
    const tests = b.addTest(.{ .root_source_file = b.path("src/runtime.zig"), .target = target, .optimize = optimize });
    const run = b.addRunArtifact(tests);
    b.step("test", "Run tests").dependOn(&run.step);
}
