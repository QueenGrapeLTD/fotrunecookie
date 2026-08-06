import Capacitor

@objc(BridgeViewController)
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginType(AppOpenAdPlugin.self)
    }
}
