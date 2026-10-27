import XCTest

/// Reads the accessibility tree of an app that is already running in the simulator. Nothing is tapped or typed.
/// It stays alive and answers requests, so the slow start (about 10 s) is paid once, not per screen:
/// LB_DIR/req-N.json {"bundle": "..."}  ->  LB_DIR/res-N.json (the tree). LB_DIR/quit ends it.
final class Dump: XCTestCase {
  func node(_ s: XCUIElementSnapshot) -> [String: Any] {
    let f = s.frame
    return ["t": s.elementType.rawValue, "label": s.label, "value": (s.value as? String) ?? "",
            "f": [f.origin.x, f.origin.y, f.size.width, f.size.height], "k": s.children.map { node($0) }]
  }
  func testServe() throws {
    let dir = ProcessInfo.processInfo.environment["LB_DIR"] ?? "/tmp/lb-ios"
    let fm = FileManager.default
    try fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
    try "ready".write(toFile: dir + "/ready", atomically: true, encoding: .utf8)
    let idleLimit = Date().addingTimeInterval(300)
    var n = 0
    while !fm.fileExists(atPath: dir + "/quit") && Date() < idleLimit {
      let req = "\(dir)/req-\(n).json"
      if let raw = fm.contents(atPath: req), let j = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
        let app = XCUIApplication(bundleIdentifier: (j["bundle"] as? String) ?? "com.apple.mobilesafari")
        app.activate()
        var out: Data
        if app.wait(for: .runningForeground, timeout: 15) {
          out = try JSONSerialization.data(withJSONObject: node(try app.snapshot()))
        } else { out = Data("{\"error\":\"app is not in the foreground\"}".utf8) }
        try out.write(to: URL(fileURLWithPath: "\(dir)/res-\(n).tmp"))
        try fm.moveItem(atPath: "\(dir)/res-\(n).tmp", toPath: "\(dir)/res-\(n).json")
        n += 1
      } else { Thread.sleep(forTimeInterval: 0.03) }
    }
  }
}
