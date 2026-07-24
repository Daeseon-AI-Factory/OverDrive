const fs = require('node:fs');
const path = require('node:path');
const {
  findNativeTargetId,
  patchSwiftAppDelegate,
  storeKitQaScheme,
  synchronizeNativeBuildVersion,
  validateResubmissionMetadata,
  validateStoreKitConfiguration,
} = require('./withReploomIosCompliance');

const appDelegate = `class AppDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return true
  }

  // Linking API
}
`;

describe('withReploomIosCompliance', () => {
  it('protects both the SQLite directory and existing database sidecars before launch', () => {
    const patched = patchSwiftAppDelegate(appDelegate);

    expect(patched).toContain('protectLocalDatabaseFromBackup()');
    expect(patched).toContain('contentsOfDirectory(');
    expect(patched).toContain('for item in [sqliteDirectory] + existingFiles');
    expect(patched).toContain('FileProtectionType.complete');
    expect(patched).toContain('values.isExcludedFromBackup = true');
  });

  it('is idempotent when prebuild applies the plugin again', () => {
    const once = patchSwiftAppDelegate(appDelegate);
    const twice = patchSwiftAppDelegate(once);

    expect(twice).toBe(once);
  });

  it('derives the native target and generates a Release-only StoreKit QA scheme', () => {
    const project = `13B07F861A680F5B00A75B9A /* Reploom */ = {
      isa = PBXNativeTarget;
    };`;
    const target = findNativeTargetId(project, 'Reploom');
    const scheme = storeKitQaScheme('Reploom', target);

    expect(target).toBe('13B07F861A680F5B00A75B9A');
    expect(scheme).toContain('buildConfiguration="Release"');
    expect(scheme).toContain('identifier="../../Reploom/Products.storekit"');
    expect(scheme).toContain(`BlueprintIdentifier = "${target}"`);
  });

  it('validates the tracked monthly StoreKit contract and rejects drift', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'storekit', 'Reploom.storekit'), 'utf8');
    expect(() => validateStoreKitConfiguration(source)).not.toThrow();
    const drifted = source.replace('"P1M"', '"P1Y"');
    expect(() => validateStoreKitConfiguration(drifted)).toThrow(/monthly subscription contract/u);
  });

  it('keeps the rejected Build 15 and unsupported age-assurance claim out of the resubmission', () => {
    const app = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'),
    );
    const store = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'store.config.json'), 'utf8'),
    );

    expect(() => validateResubmissionMetadata(app, store)).not.toThrow();
    expect(() => validateResubmissionMetadata(
      { ...app, expo: { ...app.expo, ios: { ...app.expo.ios, buildNumber: '15' } } },
      store,
    )).toThrow(/build after 15/u);
    expect(() => validateResubmissionMetadata(
      app,
      {
        ...store,
        apple: {
          ...store.apple,
          advisory: { ...store.apple.advisory, ageAssurance: true },
        },
      },
    )).toThrow(/Age Assurance/u);
  });

  it('keeps the native purchase identity bridge fail-closed with one App Store refresh fallback', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'reploom-storekit', 'ios', 'ReploomStoreKitModule.swift'),
      'utf8',
    );

    expect(source).toContain('result = try await AppTransaction.shared');
    expect(source).toContain('result = try await AppTransaction.refresh()');
    expect(source).toContain('case .unverified:');
    expect(source).toContain('ERR_APP_TRANSACTION_UNVERIFIED');
  });

  it('keeps every app-target build configuration aligned with the Expo build number', () => {
    const nativeTargets = {
      TARGET: {
        isa: 'PBXNativeTarget',
        name: 'Reploom',
        productType: 'com.apple.product-type.application',
        buildConfigurationList: 'CONFIG_LIST',
      },
    };
    const configurationLists = {
      CONFIG_LIST: {
        buildConfigurations: [{ value: 'DEBUG' }, { value: 'RELEASE' }],
      },
    };
    const buildConfigurations = {
      DEBUG: { isa: 'XCBuildConfiguration', name: 'Debug', buildSettings: { CURRENT_PROJECT_VERSION: '1' } },
      RELEASE: { isa: 'XCBuildConfiguration', name: 'Release', buildSettings: { CURRENT_PROJECT_VERSION: '13' } },
    };
    const project = {
      pbxNativeTargetSection: () => nativeTargets,
      pbxXCConfigurationList: () => configurationLists,
      pbxXCBuildConfigurationSection: () => buildConfigurations,
    };

    synchronizeNativeBuildVersion(project, 'Reploom', '14');

    expect(buildConfigurations.DEBUG.buildSettings.CURRENT_PROJECT_VERSION).toBe('14');
    expect(buildConfigurations.RELEASE.buildSettings.CURRENT_PROJECT_VERSION).toBe('14');
  });
});
