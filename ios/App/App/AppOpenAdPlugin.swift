import Foundation
import Capacitor
import GoogleMobileAds

@objc(AppOpenAdPlugin)
public class AppOpenAdPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    public let identifier = "AppOpenAdPlugin"
    public let jsName = "AppOpenAd"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise)
    ]

    private let maximumCacheAge: TimeInterval = 4 * 60 * 60
    private var appOpenAd: AppOpenAd?
    private var loadedAt: Date?
    private var isLoading = false
    private var isShowing = false

    private func isAvailable() -> Bool {
        guard let loadedAt else { return false }
        return appOpenAd != nil && Date().timeIntervalSince(loadedAt) < maximumCacheAge
    }

    @objc func prepare(_ call: CAPPluginCall) {
        guard let adId = call.getString("adId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !adId.isEmpty else {
            call.reject("App open ad unit is missing", "admob/app-open-id-missing")
            return
        }
        if isAvailable() {
            call.resolve(["ready": true])
            return
        }
        if isLoading {
            call.reject("App open ad is already loading", "admob/app-open-loading")
            return
        }

        isLoading = true
        Task { @MainActor in
            do {
                let ad = try await AppOpenAd.load(with: adId, request: Request())
                self.appOpenAd = ad
                self.appOpenAd?.fullScreenContentDelegate = self
                self.loadedAt = Date()
                self.isLoading = false
                call.resolve(["ready": true])
            } catch {
                self.appOpenAd = nil
                self.loadedAt = nil
                self.isLoading = false
                call.reject(
                    error.localizedDescription,
                    "admob/app-open-load-failed",
                    error
                )
            }
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        if isShowing {
            call.reject("App open ad is already showing", "admob/app-open-showing")
            return
        }
        guard isAvailable(), let ad = appOpenAd else {
            appOpenAd = nil
            loadedAt = nil
            call.reject("App open ad is not ready", "admob/app-open-not-ready")
            return
        }

        DispatchQueue.main.async {
            self.isShowing = true
            ad.present(from: self.getRootVC())
            call.resolve(["shown": true])
        }
    }

    public func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        appOpenAd = nil
        loadedAt = nil
        isShowing = false
        notifyListeners("dismissed", data: [:])
    }

    public func ad(
        _ ad: FullScreenPresentingAd,
        didFailToPresentFullScreenContentWithError error: Error
    ) {
        appOpenAd = nil
        loadedAt = nil
        isShowing = false
        notifyListeners("failedToShow", data: [
            "message": error.localizedDescription
        ])
    }

    public func adWillPresentFullScreenContent(_ ad: FullScreenPresentingAd) {
        notifyListeners("showed", data: [:])
    }
}
