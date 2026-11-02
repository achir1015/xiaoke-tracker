import SwiftUI
import UIKit
import WebKit

/// 小柯機器人專案追蹤工具 — iPhone／iPad 版
/// WKWebView 開啟 App 內建的手機版網頁（和 Android 版同一份程式），由 LocalServer 在 127.0.0.1 提供。
@main
struct XiaokeTrackerApp: App {
    init() {
        LocalServer.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            WebContainer()
                .background(Color(red: 0.059, green: 0.09, blue: 0.165))
                .ignoresSafeArea()
        }
    }
}

struct WebContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { Web.shared.view }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

/// 網頁與 App 之間的橋：網頁呼叫 window.webkit.messageHandlers.xkr.postMessage({cmd, args})，回傳 Promise
final class Web: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    static let shared = Web()
    let view: WKWebView
    private var saves: [String: (url: URL, handle: FileHandle, name: String)] = [:]
    private var selfTested = false

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        // 讓網頁知道自己在 iPhone／iPad App 裡（js/xk-mobile.js 會改用 App 的存檔、開網址功能）
        // 網頁的錯誤訊息轉到 iOS 系統記錄（除錯：log show --predicate 'process == "XiaokeTracker"'）
        let shim = WKUserScript(source: """
            window.XiaokeIOS = true;
            (function () {
              function send(k, a) { try { window.webkit.messageHandlers.xkr.postMessage({ cmd: 'log', args: [k, Array.prototype.map.call(a, function (x) { return x && x.stack ? x.stack : String(x); }).join(' ')] }); } catch (e) {} }
              var ce = console.error.bind(console);
              console.error = function () { send('error', arguments); ce.apply(null, arguments); };
              window.addEventListener('error', function (e) { send('pageerror', [e.message + ' @' + e.filename + ':' + e.lineno]); });
              window.addEventListener('unhandledrejection', function (e) { send('rejection', [e.reason]); });
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        cfg.userContentController.addUserScript(shim)
        view = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "xkr")
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.059, green: 0.09, blue: 0.165, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { view.isInspectable = true }
        view.load(URLRequest(url: LocalServer.shared.url))
    }

    // 外部連結（GitHub、OpenAI）用 Safari 開
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, u.host != "127.0.0.1", u.scheme?.hasPrefix("http") == true, a.targetFrame?.isMainFrame != false {
            UIApplication.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { UIApplication.shared.open(u) }
        return nil
    }

    // 實機自我檢查：devicectl 帶環境變數 XK_SELFTEST=1 啟動才會跑，結果寫到 App 的 Documents（selftest.txt、selftest.png）
    func webView(_ w: WKWebView, didFinish nav: WKNavigation!) {
        guard ProcessInfo.processInfo.environment["XK_SELFTEST"] == "1", !selfTested else { return }
        selfTested = true
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            w.evaluateJavaScript("[...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent.includes('先自己看看'))?.click(); 1") { _, _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    let js = """
                    JSON.stringify({ ready: document.documentElement.dataset.ready, platform: document.documentElement.dataset.platform, version: window.XK_VERSION, w: innerWidth, h: innerHeight,
                      cards: document.querySelectorAll('.card').length, modal: !!document.querySelector('.modal'), overflow: document.documentElement.scrollWidth > innerWidth + 1,
                      topbar: getComputedStyle(document.querySelector('#topbar')).display, safeTop: getComputedStyle(document.querySelector('#topbar')).paddingTop,
                      zhVoices: speechSynthesis.getVoices().filter((v) => /^zh/i.test(v.lang)).length, title: document.querySelector('#topTitle').textContent })
                    """
                    w.evaluateJavaScript(js) { r, e in
                        try? String(describing: r ?? e ?? "nil").write(to: docs.appendingPathComponent("selftest.txt"), atomically: true, encoding: .utf8)
                        w.takeSnapshot(with: nil) { img, _ in try? img?.pngData()?.write(to: docs.appendingPathComponent("selftest.png")) }
                    }
                }
            }
        }
    }

    // 網頁被系統回收時（記憶體不足）自動重新載入
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }

    // MARK: 網頁呼叫的功能
    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = m.body as? [String: Any], let cmd = body["cmd"] as? String else { replyHandler(nil, "bad message"); return }
        let args = body["args"] as? [Any] ?? []
        let s = { (i: Int) -> String in args.count > i ? "\(args[i])" : "" }
        let ver = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        switch cmd {
        case "app_info":
            replyHandler(["status": "ok", "name": "小柯專案追蹤", "version": ver, "platform": "ios", "model": UIDevice.current.model], nil)
        case "begin_save":
            // 匯出：先寫到暫存檔，結束時打開分享選單（儲存到檔案、AirDrop、LINE…）
            let name = s(0).replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("export", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(name.isEmpty ? "匯出.txt" : name)
            try? FileManager.default.removeItem(at: url)
            FileManager.default.createFile(atPath: url.path, contents: nil)
            guard let h = try? FileHandle(forWritingTo: url) else { replyHandler(["status": "error", "message": "無法建立檔案"], nil); return }
            let token = UUID().uuidString
            saves[token] = (url, h, url.lastPathComponent)
            replyHandler(["status": "ok", "token": token, "path": url.lastPathComponent], nil)
        case "write_chunk":
            guard let sv = saves[s(0)], let d = Data(base64Encoded: s(1)) else { replyHandler(["status": "error", "message": "no session"], nil); return }
            sv.handle.write(d)
            replyHandler(["status": "ok"], nil)
        case "end_save":
            guard let sv = saves.removeValue(forKey: s(0)) else { replyHandler(["status": "error", "message": "no session"], nil); return }
            try? sv.handle.close()
            share(sv.url) { done in replyHandler(done ? ["status": "ok", "path": sv.name] : ["status": "declined"], nil) }
        case "log":
            NSLog("[web %@] %@", s(0), s(1))
            replyHandler(true, nil)
        case "open_url":
            if let u = URL(string: s(0)), ["github.com", "achir1015.github.io", "platform.openai.com", "apps.apple.com"].contains(u.host ?? "") { UIApplication.shared.open(u) }
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown command \(cmd)")
        }
    }

    private func share(_ url: URL, done: @escaping (Bool) -> Void) {
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.completionWithItemsHandler = { _, completed, _, _ in done(completed) }
        if let p = vc.popoverPresentationController {   // iPad：從畫面中央彈出
            p.sourceView = view
            p.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            p.permittedArrowDirections = []
        }
        present(vc) { done(false) }
    }

    private func present(_ vc: UIViewController, fail: () -> Void) {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        while let p = top?.presentedViewController { top = p }
        if let top { top.present(vc, animated: true) } else { fail() }
    }
}
