import CryptoKit
import ExpoModulesCore
import Foundation
import StoreKit
import UIKit

private let reploomBundleID = "ai.daeseon.reploom"
private let proMonthlyProductID = "ai.daeseon.reploom.pro.monthly.v1"
private let entitlementChangedEvent = "entitlementChanged"
private let transactionUpdatedEvent = "transactionUpdated"

public final class ReploomStoreKitModule: Module {
  private var transactionUpdatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("ExpoReploomStoreKit")

    Events(entitlementChangedEvent, transactionUpdatedEvent)

    // Screenshot-only state injection. Simulator compilation is the hard gate: the App Store
    // device binary always returns nil even if a process argument is supplied.
    Function("getSubscriptionUiFixture") { () -> String? in
      subscriptionUiFixture()
    }

    OnCreate {
      startTransactionUpdatesListener()
    }

    OnDestroy {
      transactionUpdatesTask?.cancel()
      transactionUpdatesTask = nil
    }

    AsyncFunction("getProductAsync") { (productID: String) async throws -> [String: Any?]? in
      try requireSupportedProductID(productID)
      guard let product = try await loadProduct(productID) else {
        return nil
      }
      return productPayload(product)
    }

    AsyncFunction("getEntitlementAsync") { (productID: String?) async throws -> [String: Any?]? in
      let resolvedProductID = try resolveProductID(productID)
      return try await currentEntitlementPayload(for: resolvedProductID)
    }

    AsyncFunction("purchaseAsync") { (productID: String, appAccountToken: String?) async throws -> [String: Any?] in
      try requireSupportedProductID(productID)

      guard let product = try await loadProduct(productID) else {
        throw moduleError(
          code: "ERR_PRODUCT_NOT_FOUND",
          description: "The Reploom Pro subscription is not available from the App Store."
        )
      }
      try requireMonthlyAutoRenewableProduct(product)

      let expectedAppAccountToken = try await derivedAppAccountToken()
      if let appAccountToken {
        guard let token = UUID(uuidString: appAccountToken) else {
          throw moduleError(
            code: "ERR_INVALID_APP_ACCOUNT_TOKEN",
            description: "The app account token must be a UUID."
          )
        }
        guard token == expectedAppAccountToken else {
          throw moduleError(
            code: "ERR_APP_ACCOUNT_TOKEN_MISMATCH",
            description: "The app account token does not match this App Store account."
          )
        }
      }
      let purchaseOptions: Set<Product.PurchaseOption> = [
        .appAccountToken(expectedAppAccountToken),
      ]

      let result = try await product.purchase(options: purchaseOptions)
      switch result {
      case .success(let verificationResult):
        let verified = try verifiedTransaction(from: verificationResult)
        guard verified.transaction.productID == productID else {
          throw moduleError(
            code: "ERR_PRODUCT_MISMATCH",
            description: "The verified transaction does not match the requested product."
          )
        }
        if verified.transaction.appAccountToken != expectedAppAccountToken {
          throw moduleError(
            code: "ERR_APP_ACCOUNT_TOKEN_MISMATCH",
            description: "The verified transaction does not match this app account."
          )
        }
        guard isActiveEntitlement(verified.transaction) else {
          throw moduleError(
            code: "ERR_TRANSACTION_NOT_ACTIVE",
            description: "The verified subscription transaction is not active."
          )
        }

        let entitlement = transactionPayload(
          verified.transaction,
          jwsRepresentation: verified.jwsRepresentation
        )
        await verified.transaction.finish()
        sendEvent(transactionUpdatedEvent, [
          "status": "verified",
          "transaction": entitlement,
        ])
        sendEvent(entitlementChangedEvent, ["entitlement": entitlement])
        return [
          "status": "purchased",
          "entitlement": entitlement,
        ]
      case .userCancelled:
        return ["status": "cancelled"]
      case .pending:
        return ["status": "pending"]
      @unknown default:
        throw moduleError(
          code: "ERR_UNKNOWN_PURCHASE_RESULT",
          description: "The App Store returned an unknown purchase result."
        )
      }
    }

    AsyncFunction("restoreAsync") { (productID: String?) async throws -> [String: Any?]? in
      let resolvedProductID = try resolveProductID(productID)
      try await AppStore.sync()
      let entitlement = try await currentEntitlementPayload(for: resolvedProductID)
      sendEvent(entitlementChangedEvent, ["entitlement": entitlement])
      return entitlement
    }

    AsyncFunction("openManageSubscriptionsAsync") { () async throws in
      guard let scene = await foregroundWindowScene() else {
        throw moduleError(
          code: "ERR_NO_FOREGROUND_SCENE",
          description: "A foreground app window is required to manage subscriptions."
        )
      }
      try await AppStore.showManageSubscriptions(in: scene)
    }

    AsyncFunction("getAppTransactionAsync") { () async throws -> [String: Any?]? in
      let verified = try await verifiedAppTransaction()
      return appTransactionPayload(
        verified.appTransaction,
        jwsRepresentation: verified.jwsRepresentation
      )
    }

    AsyncFunction("getAppAccountTokenAsync") { () async throws -> String in
      try await derivedAppAccountToken().uuidString.lowercased()
    }
  }

  private func startTransactionUpdatesListener() {
    guard transactionUpdatesTask == nil else {
      return
    }

    transactionUpdatesTask = Task { [weak self] in
      for await result in StoreKit.Transaction.updates {
        guard !Task.isCancelled else {
          return
        }
        await self?.handleTransactionUpdate(result)
      }
    }
  }

  private func subscriptionUiFixture() -> String? {
#if targetEnvironment(simulator)
    let prefix = "-ReploomSubscriptionUIFixture="
    guard let argument = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(prefix) }) else {
      return nil
    }
    let value = String(argument.dropFirst(prefix.count))
    return ["active", "quota"].contains(value) ? value : nil
#else
    return nil
#endif
  }

  private func handleTransactionUpdate(
    _ result: VerificationResult<StoreKit.Transaction>
  ) async {
    switch result {
    case .verified(let transaction):
      guard transaction.productID == proMonthlyProductID else {
        return
      }

      let payload = transactionPayload(
        transaction,
        jwsRepresentation: result.jwsRepresentation
      )
      await transaction.finish()
      sendEvent(transactionUpdatedEvent, [
        "status": "verified",
        "transaction": payload,
      ])

      do {
        let entitlement = try await currentEntitlementPayload(for: proMonthlyProductID)
        sendEvent(entitlementChangedEvent, ["entitlement": entitlement])
      } catch {
        sendEvent(entitlementChangedEvent, ["entitlement": nil])
      }
    case .unverified(let transaction, _):
      guard transaction.productID == proMonthlyProductID else {
        return
      }
      sendEvent(transactionUpdatedEvent, [
        "status": "unverified",
        "errorCode": "ERR_TRANSACTION_UNVERIFIED",
      ])
    }
  }

  private func currentEntitlementPayload(for productID: String) async throws -> [String: Any?]? {
    var newestEntitlement: (
      transaction: StoreKit.Transaction,
      jwsRepresentation: String
    )?

    for await result in StoreKit.Transaction.currentEntitlements {
      switch result {
      case .verified(let transaction):
        guard transaction.productID == productID, isActiveEntitlement(transaction) else {
          continue
        }
        if let current = newestEntitlement,
          entitlementSortDate(current.transaction) >= entitlementSortDate(transaction) {
          continue
        }
        newestEntitlement = (transaction, result.jwsRepresentation)
      case .unverified(let transaction, _):
        guard transaction.productID == productID else {
          continue
        }
        throw moduleError(
          code: "ERR_TRANSACTION_UNVERIFIED",
          description: "The App Store could not verify the subscription transaction."
        )
      }
    }

    guard let newestEntitlement else {
      return nil
    }
    return transactionPayload(
      newestEntitlement.transaction,
      jwsRepresentation: newestEntitlement.jwsRepresentation
    )
  }

  private func loadProduct(_ productID: String) async throws -> Product? {
    try await Product.products(for: [productID]).first { $0.id == productID }
  }

  private func resolveProductID(_ productID: String?) throws -> String {
    let resolvedProductID = productID ?? proMonthlyProductID
    try requireSupportedProductID(resolvedProductID)
    return resolvedProductID
  }

  private func requireSupportedProductID(_ productID: String) throws {
    guard productID == proMonthlyProductID else {
      throw moduleError(
        code: "ERR_UNSUPPORTED_PRODUCT",
        description: "This StoreKit bridge only supports the Reploom Pro monthly subscription."
      )
    }
  }

  private func requireMonthlyAutoRenewableProduct(_ product: Product) throws {
    guard product.type == .autoRenewable,
      let subscriptionPeriod = product.subscription?.subscriptionPeriod,
      subscriptionPeriod.unit == .month,
      subscriptionPeriod.value == 1 else {
      throw moduleError(
        code: "ERR_PRODUCT_CONFIGURATION",
        description: "The App Store product is not configured as a one-month auto-renewable subscription."
      )
    }
  }

  private func verifiedTransaction(
    from result: VerificationResult<StoreKit.Transaction>
  ) throws -> (transaction: StoreKit.Transaction, jwsRepresentation: String) {
    switch result {
    case .verified(let transaction):
      return (transaction, result.jwsRepresentation)
    case .unverified:
      throw moduleError(
        code: "ERR_TRANSACTION_UNVERIFIED",
        description: "The App Store could not verify the purchase transaction."
      )
    }
  }

  private func verifiedAppTransaction() async throws -> (
    appTransaction: AppTransaction,
    jwsRepresentation: String
  ) {
    let result: VerificationResult<AppTransaction>
    do {
      result = try await AppTransaction.shared
    } catch {
      // `shared` can be unavailable before the App Store account has refreshed. Give StoreKit one
      // bounded opportunity to show its account flow and fetch the signed app transaction.
      result = try await AppTransaction.refresh()
    }
    switch result {
    case .verified(let appTransaction):
      guard appTransaction.bundleID == reploomBundleID else {
        throw moduleError(
          code: "ERR_APP_BUNDLE_MISMATCH",
          description: "The verified app transaction does not belong to Reploom."
        )
      }
      return (appTransaction, result.jwsRepresentation)
    case .unverified:
      throw moduleError(
        code: "ERR_APP_TRANSACTION_UNVERIFIED",
        description: "The App Store could not verify this app transaction."
      )
    }
  }

  private func derivedAppAccountToken() async throws -> UUID {
    let verified = try await verifiedAppTransaction()
    let appTransactionID = verified.appTransaction.appTransactionID
    guard !appTransactionID.isEmpty else {
      throw moduleError(
        code: "ERR_APP_TRANSACTION_ID_UNAVAILABLE",
        description: "The App Store did not provide an app transaction identifier."
      )
    }

    let domainSeparatedInput = Data(
      "reploom-app-account-token-v1\u{0}\(reploomBundleID)\u{0}\(appTransactionID)".utf8
    )
    var bytes = Array(SHA256.hash(data: domainSeparatedInput).prefix(16))
    // RFC 9562 UUIDv8 reserves this version for application-defined deterministic schemes.
    bytes[6] = (bytes[6] & 0x0F) | 0x80
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    return UUID(uuid: (
      bytes[0], bytes[1], bytes[2], bytes[3],
      bytes[4], bytes[5], bytes[6], bytes[7],
      bytes[8], bytes[9], bytes[10], bytes[11],
      bytes[12], bytes[13], bytes[14], bytes[15]
    ))
  }

  private func isActiveEntitlement(_ transaction: StoreKit.Transaction) -> Bool {
    guard transaction.revocationDate == nil, !transaction.isUpgraded else {
      return false
    }
    guard let expirationDate = transaction.expirationDate else {
      return true
    }
    return expirationDate > Date()
  }

  private func entitlementSortDate(_ transaction: StoreKit.Transaction) -> Date {
    transaction.expirationDate ?? transaction.purchaseDate
  }

  private func productPayload(_ product: Product) -> [String: Any?] {
    let subscriptionPeriod = product.subscription?.subscriptionPeriod
    return [
      "id": product.id,
      "displayName": product.displayName,
      "description": product.description,
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).doubleValue,
      "currencyCode": product.priceFormatStyle.currencyCode,
      "subscriptionPeriod": subscriptionPeriod.map {
        [
          "unit": subscriptionPeriodUnit($0.unit),
          "value": $0.value,
        ]
      },
    ]
  }

  private func transactionPayload(
    _ transaction: StoreKit.Transaction,
    jwsRepresentation: String
  ) -> [String: Any?] {
    [
      "productId": transaction.productID,
      "transactionId": String(transaction.id),
      "originalTransactionId": String(transaction.originalID),
      "appTransactionId": transaction.appTransactionID,
      "purchaseDate": iso8601String(transaction.purchaseDate),
      "originalPurchaseDate": iso8601String(transaction.originalPurchaseDate),
      "expirationDate": transaction.expirationDate.map(iso8601String),
      "revocationDate": transaction.revocationDate.map(iso8601String),
      "isUpgraded": transaction.isUpgraded,
      "environment": environmentName(transaction.environment),
      "appAccountToken": transaction.appAccountToken?.uuidString.lowercased(),
      "jwsRepresentation": jwsRepresentation,
    ]
  }

  private func appTransactionPayload(
    _ appTransaction: AppTransaction,
    jwsRepresentation: String
  ) -> [String: Any?] {
    [
      "appTransactionId": appTransaction.appTransactionID,
      "appId": appTransaction.appID.map(String.init),
      "appVersionId": appTransaction.appVersionID.map(String.init),
      "appVersion": appTransaction.appVersion,
      "originalAppVersion": appTransaction.originalAppVersion,
      "bundleId": appTransaction.bundleID,
      "originalPurchaseDate": iso8601String(appTransaction.originalPurchaseDate),
      "environment": environmentName(appTransaction.environment),
      "jwsRepresentation": jwsRepresentation,
    ]
  }

  private func subscriptionPeriodUnit(
    _ unit: Product.SubscriptionPeriod.Unit
  ) -> String {
    switch unit {
    case .day:
      return "day"
    case .week:
      return "week"
    case .month:
      return "month"
    case .year:
      return "year"
    @unknown default:
      return "month"
    }
  }

  private func environmentName(_ environment: AppStore.Environment) -> String {
    switch environment {
    case .sandbox:
      return "sandbox"
    case .production:
      return "production"
    case .xcode:
      return "xcode"
    default:
      return "unknown"
    }
  }

  private func iso8601String(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  @MainActor
  private func foregroundWindowScene() -> UIWindowScene? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
  }

  private func moduleError(code: String, description: String) -> Exception {
    Exception(name: "ReploomStoreKitError", description: description, code: code)
  }
}
